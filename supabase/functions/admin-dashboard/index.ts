import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

function normalizeText(value: unknown) {
  return String(value || "").trim()
}

function isoOrNull(value: unknown) {
  const raw = normalizeText(value)
  if (!raw) return null
  const dt = new Date(raw)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

function isFuture(isoString: string | null) {
  if (!isoString) return false
  const value = new Date(isoString).getTime()
  return Number.isFinite(value) && value > Date.now()
}

function isRecent(isoString: string | null, minutes: number) {
  if (!isoString) return false
  const value = new Date(isoString).getTime()
  if (!Number.isFinite(value)) return false
  return (Date.now() - value) <= minutes * 60 * 1000
}

function formatMonthKey(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

function formatMonthLabelFromKey(key: string) {
  const [yearRaw, monthRaw] = key.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return key
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function lastMonthKeys(count: number) {
  const now = new Date()
  const items: string[] = []
  for (let index = count - 1; index >= 0; index -= 1) {
    const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))
    items.push(formatMonthKey(current))
  }
  return items
}

function countByMonth<T>(rows: T[], keys: string[], pickIso: (row: T) => string | null) {
  const counts = new Map<string, number>()
  for (const key of keys) counts.set(key, 0)
  for (const row of rows) {
    const iso = pickIso(row)
    if (!iso) continue
    const dt = new Date(iso)
    if (Number.isNaN(dt.getTime())) continue
    const key = formatMonthKey(dt)
    if (!counts.has(key)) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return keys.map((key) => ({
    key,
    label: formatMonthLabelFromKey(key),
    value: counts.get(key) || 0,
  }))
}

function isBillingStillActive(status: string, endsAt: string | null) {
  if (["active", "trialing"].includes(status)) return true
  if (["canceled", "cancelled", "past_due", "paused", "unpaid"].includes(status) && endsAt) {
    return isFuture(endsAt)
  }
  return false
}

function isCanceledButStillRunning(status: string, endsAt: string | null, canceledAt: string | null, raw: Record<string, unknown>) {
  const cancelAtPeriodEnd = raw?.cancel_at_period_end === true
    || raw?.cancel_at_period_end === "true"
    || raw?.cancel_at_period_end === 1
  if (!isFuture(endsAt)) return false
  if (cancelAtPeriodEnd) return true
  if (canceledAt) return true
  return ["canceled", "cancelled"].includes(status)
}

type AccountRow = {
  user_id: string
  email: string | null
  username: string | null
  created_at: string | null
  email_confirmed_at: string | null
  last_sign_in_at: string | null
  is_admin: boolean
  access_state: string | null
  access_source: string | null
  access_granted_at: string | null
  access_expires_at: string | null
  latest_key_code: string | null
  latest_key_redeemed_at: string | null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "missing_supabase_env" }, 500)
    }
    if (!token) {
      return json({ error: "not_authenticated" }, 401)
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: userData, error: userError } = await serviceClient.auth.getUser(token)
    const user = userData.user
    if (userError || !user) {
      return json({ error: "not_authenticated" }, 401)
    }

    const { data: adminRow, error: adminError } = await serviceClient
      .from("app_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (adminError || !adminRow) {
      return json({ error: "not_admin" }, 403)
    }

    const scopedClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: { persistSession: false },
    })

    const { data: accountRows, error: accountError } = await scopedClient.rpc("admin_list_accounts", {
      p_search: null,
      p_filter: "all",
    })

    if (accountError) {
      return json({ error: "load_accounts_failed", detail: accountError.message }, 500)
    }

    const { data: sessionRows, error: sessionError } = await serviceClient
      .schema("auth")
      .from("sessions")
      .select("user_id, updated_at, created_at, not_after")

    if (sessionError) {
      return json({ error: "load_sessions_failed", detail: sessionError.message }, 500)
    }

    const latestSessionByUser = new Map<string, string>()
    ;(sessionRows || []).forEach((row: Record<string, unknown>) => {
      const userId = normalizeText(row.user_id)
      const lastSeen = isoOrNull(row.updated_at) || isoOrNull(row.created_at)
      const notAfter = isoOrNull(row.not_after)
      if (!userId || !lastSeen || (notAfter && !isFuture(notAfter))) return
      const previous = latestSessionByUser.get(userId)
      if (!previous || new Date(lastSeen).getTime() > new Date(previous).getTime()) {
        latestSessionByUser.set(userId, lastSeen)
      }
    })

    const accounts = ((accountRows || []) as AccountRow[]).map((row) => {
      const siteLastSeenAt = latestSessionByUser.get(row.user_id) || null
      return {
        userId: row.user_id,
        email: row.email,
        username: row.username,
        createdAt: row.created_at,
        emailConfirmedAt: row.email_confirmed_at,
        lastSignInAt: row.last_sign_in_at,
        isAdmin: row.is_admin === true,
        accessState: row.access_state || "no_access",
        accessSource: row.access_source,
        accessGrantedAt: row.access_granted_at,
        accessExpiresAt: row.access_expires_at,
        latestKeyCode: row.latest_key_code,
        latestKeyRedeemedAt: row.latest_key_redeemed_at,
        siteLastSeenAt,
        siteConnected: isRecent(siteLastSeenAt, 30),
        siteActive: isRecent(siteLastSeenAt, 5),
      }
    })

    const accountSummary = {
      totalAccounts: accounts.length,
      confirmedAccounts: accounts.filter((row) => !!row.emailConfirmedAt).length,
      connectedOnSite: accounts.filter((row) => row.siteConnected).length,
      activeOnSite: accounts.filter((row) => row.siteActive).length,
      activeAccess: accounts.filter((row) => row.accessState === "active" || row.accessState === "admin").length,
      noAccess: accounts.filter((row) => row.accessState === "no_access").length,
      expiredAccess: accounts.filter((row) => row.accessState === "expired").length,
      adminAccounts: accounts.filter((row) => row.isAdmin).length,
    }

    const accountBreakdown = [
      {
        key: "free",
        label: "Free mode",
        value: accountSummary.noAccess,
      },
      {
        key: "premium",
        label: "Premium active",
        value: accountSummary.activeAccess - accountSummary.adminAccounts,
      },
      {
        key: "expired",
        label: "Premium expired",
        value: accountSummary.expiredAccess,
      },
      {
        key: "admin",
        label: "Admin",
        value: accountSummary.adminAccounts,
      },
    ]

    const [{ data: stripeRows, error: stripeError }, { data: paddleRows, error: paddleError }] = await Promise.all([
      serviceClient
        .from("stripe_subscriptions")
        .select("stripe_subscription_id, customer_email, status, current_period_starts_at, current_period_ends_at, canceled_at, activated_at, created_at, updated_at, raw"),
      serviceClient
        .from("paddle_subscriptions")
        .select("paddle_subscription_id, customer_email, status, current_period_starts_at, current_period_ends_at, canceled_at, activated_at, created_at, updated_at, raw"),
    ])

    if (stripeError) {
      return json({ error: "load_stripe_subscriptions_failed", detail: stripeError.message }, 500)
    }
    if (paddleError) {
      return json({ error: "load_paddle_subscriptions_failed", detail: paddleError.message }, 500)
    }

    const salesRows = [
      ...((stripeRows || []).map((row: Record<string, unknown>) => ({
        provider: "stripe",
        subscriptionId: normalizeText(row.stripe_subscription_id),
        customerEmail: normalizeText(row.customer_email),
        status: normalizeText(row.status).toLowerCase(),
        currentPeriodStartsAt: isoOrNull(row.current_period_starts_at),
        currentPeriodEndsAt: isoOrNull(row.current_period_ends_at),
        canceledAt: isoOrNull(row.canceled_at),
        activatedAt: isoOrNull(row.activated_at),
        createdAt: isoOrNull(row.created_at),
        updatedAt: isoOrNull(row.updated_at),
        raw: (row.raw && typeof row.raw === "object") ? row.raw as Record<string, unknown> : {},
      })) || []),
      ...((paddleRows || []).map((row: Record<string, unknown>) => ({
        provider: "paddle",
        subscriptionId: normalizeText(row.paddle_subscription_id),
        customerEmail: normalizeText(row.customer_email),
        status: normalizeText(row.status).toLowerCase(),
        currentPeriodStartsAt: isoOrNull(row.current_period_starts_at),
        currentPeriodEndsAt: isoOrNull(row.current_period_ends_at),
        canceledAt: isoOrNull(row.canceled_at),
        activatedAt: isoOrNull(row.activated_at),
        createdAt: isoOrNull(row.created_at),
        updatedAt: isoOrNull(row.updated_at),
        raw: (row.raw && typeof row.raw === "object") ? row.raw as Record<string, unknown> : {},
      })) || []),
    ].map((row) => {
      const active = isBillingStillActive(row.status, row.currentPeriodEndsAt)
      const canceledButStillRunning = isCanceledButStillRunning(row.status, row.currentPeriodEndsAt, row.canceledAt, row.raw)
      return {
        ...row,
        active,
        canceledButStillRunning,
      }
    }).sort((a, b) => {
      const aTs = new Date(a.createdAt || a.activatedAt || 0).getTime()
      const bTs = new Date(b.createdAt || b.activatedAt || 0).getTime()
      return bTs - aTs
    })

    const salesSummary = {
      totalSubscriptions: salesRows.length,
      activeSubscriptions: salesRows.filter((row) => row.active).length,
      canceledButRunning: salesRows.filter((row) => row.canceledButStillRunning).length,
      endedSubscriptions: salesRows.filter((row) => !row.active).length,
      stripeSubscriptions: salesRows.filter((row) => row.provider === "stripe").length,
      paddleSubscriptions: salesRows.filter((row) => row.provider === "paddle").length,
    }

    const salesBreakdown = [
      {
        key: "active",
        label: "Active",
        value: salesSummary.activeSubscriptions - salesSummary.canceledButRunning,
      },
      {
        key: "canceled_running",
        label: "Cancelled, still active",
        value: salesSummary.canceledButRunning,
      },
      {
        key: "ended",
        label: "Ended",
        value: salesSummary.endedSubscriptions,
      },
    ]

    const providerBreakdown = [
      {
        key: "stripe",
        label: "Stripe",
        value: salesSummary.stripeSubscriptions,
      },
      {
        key: "paddle",
        label: "Paddle",
        value: salesSummary.paddleSubscriptions,
      },
    ]

    const monthKeys = lastMonthKeys(6)
    const accountTimeline = countByMonth(accounts, monthKeys, (row) => row.createdAt || null)
    const salesTimeline = countByMonth(salesRows, monthKeys, (row) => row.activatedAt || row.createdAt || row.currentPeriodStartsAt)

    let releaseSummary: Record<string, unknown> = {
      latestTag: null,
      latestPublishedAt: null,
      releases: [],
    }
    try {
      const ghResponse = await fetch("https://api.github.com/repos/tdaval-78/riftskin-updates/releases?per_page=10", {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "RIFTSKIN-admin-dashboard",
        },
      })
      if (ghResponse.ok) {
        const ghPayload = await ghResponse.json()
        const releases = Array.isArray(ghPayload)
          ? ghPayload.map((row: Record<string, unknown>) => ({
            tag: normalizeText(row.tag_name),
            name: normalizeText(row.name),
            publishedAt: isoOrNull(row.published_at),
            isDraft: row.draft === true,
            isPrerelease: row.prerelease === true,
            url: normalizeText(row.html_url),
          })).filter((row) => row.tag)
          : []
        const latest = releases[0] || null
        releaseSummary = {
          latestTag: latest?.tag || null,
          latestPublishedAt: latest?.publishedAt || null,
          releases,
        }
      }
    } catch (_error) {
      // Best-effort only; dashboard still works without GitHub release data.
    }

    return json({
      ok: true,
      accountSummary,
      accountBreakdown,
      accountTimeline,
      accounts,
      salesSummary,
      salesBreakdown,
      providerBreakdown,
      salesTimeline,
      subscriptions: salesRows,
      releaseSummary,
    })
  } catch (error) {
    return json({
      error: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
