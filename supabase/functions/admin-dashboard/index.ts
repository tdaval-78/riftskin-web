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

function unixToIso(value: unknown) {
  const parsed = Number(value || 0)
  if (!parsed) return null
  const date = new Date(parsed * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
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

async function stripeListAll(path: string, apiKey: string) {
  let hasMore = true
  let startingAfter = ""
  const rows: Record<string, unknown>[] = []

  while (hasMore) {
    const separator = path.includes("?") ? "&" : "?"
    const response = await fetch(`https://api.stripe.com${path}${separator}limit=100${startingAfter ? `&starting_after=${encodeURIComponent(startingAfter)}` : ""}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = payload?.error?.message || `Stripe request failed: ${path}`
      throw new Error(detail)
    }
    const data = Array.isArray(payload.data) ? payload.data as Record<string, unknown>[] : []
    rows.push(...data)
    hasMore = payload.has_more === true && data.length > 0
    startingAfter = hasMore ? String(data[data.length - 1]?.id || "").trim() : ""
    if (hasMore && !startingAfter) break
  }

  return rows
}

async function listAllAuthUsers(adminClient: any) {
  const rows: Record<string, unknown>[] = []
  let page = 1

  while (page <= 50) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    const users = Array.isArray(data?.users)
      ? data.users.map((user: any) => ({
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          email_confirmed_at: user.email_confirmed_at,
          last_sign_in_at: user.last_sign_in_at,
        }))
      : []
    rows.push(...users)
    if (users.length < 200) break
    page += 1
  }

  return rows
}

function yearRange(year: number) {
  const start = Date.UTC(year, 0, 1, 0, 0, 0)
  const end = Date.UTC(year, 11, 31, 23, 59, 59)
  return {
    startUnix: Math.floor(start / 1000),
    endUnix: Math.floor(end / 1000),
  }
}

function maxUnixTimestamp(...values: Array<number | null | undefined>) {
  let result = 0
  for (const value of values) {
    const parsed = Number(value || 0)
    if (Number.isFinite(parsed) && parsed > result) result = parsed
  }
  return result || null
}

function formatMoneyMinorUnits(amountMinor: number, currency: string) {
  const normalizedCurrency = String(currency || "EUR").trim().toUpperCase() || "EUR"
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: normalizedCurrency,
  }).format((amountMinor || 0) / 100)
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

function endsWithinDays(isoString: string | null, days: number) {
  if (!isoString) return false
  const value = new Date(isoString).getTime()
  if (!Number.isFinite(value)) return false
  const now = Date.now()
  const max = now + (days * 24 * 60 * 60 * 1000)
  return value >= now && value <= max
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

function buildStripeSubscriptionRow(row: Record<string, unknown>) {
  const customer = row.customer && typeof row.customer === "object"
    ? row.customer as Record<string, unknown>
    : null
  const metadata = row.metadata && typeof row.metadata === "object"
    ? row.metadata as Record<string, unknown>
    : null
  const status = normalizeText(row.status).toLowerCase()
  const currentPeriodStartsAt = unixToIso(row.current_period_start)
  const currentPeriodEndsAt = unixToIso(row.current_period_end)
  const canceledAt = unixToIso(row.canceled_at)
  const activatedAt = unixToIso(row.start_date) || currentPeriodStartsAt
  const createdAt = unixToIso(row.created)
  const updatedAt = unixToIso(row.created)
  const raw = row

  return {
    provider: "stripe",
    subscriptionId: normalizeText(row.id),
    customerEmail: normalizeText(customer?.email || row.customer_email || metadata?.email),
    status,
    currentPeriodStartsAt,
    currentPeriodEndsAt,
    canceledAt,
    activatedAt,
    createdAt,
    updatedAt,
    raw,
    active: isBillingStillActive(status, currentPeriodEndsAt),
    canceledButStillRunning: isCanceledButStillRunning(status, currentPeriodEndsAt, canceledAt, raw),
  }
}

type SalesRow = {
  provider: string
  subscriptionId: string
  customerEmail: string
  status: string
  currentPeriodStartsAt: string | null
  currentPeriodEndsAt: string | null
  canceledAt: string | null
  activatedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  raw: Record<string, unknown>
  active: boolean
  canceledButStillRunning: boolean
}

type AuditRow = {
  customerEmail: string
  subscriptionActive: boolean
  subscriptionStatus: string
  activationKeyCode: string | null
  machineLicenseActive: boolean
  machineActivationCount: number
  anomaly: boolean
  anomalyReason: string
}

function subscriptionAuditPriority(row: { status: string, currentPeriodEndsAt: string | null, updatedAt: string | null, createdAt: string | null }) {
  if (isBillingStillActive(row.status, row.currentPeriodEndsAt)) {
    return ["active", "trialing"].includes(row.status) ? 0 : 1
  }
  return 2
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")
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

    const [
      authUsers,
      profilesResult,
      adminUsersResult,
      accessResult,
      keyRedemptionsResult,
      runtimeStateResult,
    ] = await Promise.all([
      listAllAuthUsers(serviceClient),
      serviceClient.from("profiles").select("id, username"),
      serviceClient.from("app_admins").select("user_id"),
      serviceClient.from("user_access").select("user_id, source, granted_at, expires_at, is_active"),
      serviceClient.from("key_redemptions").select("user_id, key_id, redeemed_at").order("redeemed_at", { ascending: false }),
      serviceClient.from("app_service_status").select("service_message, published_at, updated_at").eq("channel", "admin-reset-baseline").maybeSingle(),
    ])

    if (profilesResult.error) {
      return json({ error: "load_profiles_failed", detail: profilesResult.error.message }, 500)
    }
    if (adminUsersResult.error) {
      return json({ error: "load_admin_users_failed", detail: adminUsersResult.error.message }, 500)
    }
    if (accessResult.error) {
      return json({ error: "load_access_failed", detail: accessResult.error.message }, 500)
    }
    if (keyRedemptionsResult.error) {
      return json({ error: "load_key_redemptions_failed", detail: keyRedemptionsResult.error.message }, 500)
    }
    if (runtimeStateResult.error) {
      return json({ error: "load_runtime_state_failed", detail: runtimeStateResult.error.message }, 500)
    }
    const accountRows = authUsers
    const resetBaselineIso = isoOrNull(runtimeStateResult.data?.service_message)
      || isoOrNull(runtimeStateResult.data?.updated_at)
      || isoOrNull(runtimeStateResult.data?.published_at)
      || null
    const resetBaselineUnix = resetBaselineIso ? Math.floor(new Date(resetBaselineIso).getTime() / 1000) : null

    const profileByUserId = new Map<string, string>()
    for (const row of profilesResult.data || []) {
      const userId = normalizeText(row.id)
      if (userId) profileByUserId.set(userId, normalizeText(row.username))
    }

    const adminUserIds = new Set<string>()
    for (const row of adminUsersResult.data || []) {
      const userId = normalizeText(row.user_id)
      if (userId) adminUserIds.add(userId)
    }

    const accessByUserId = new Map<string, Record<string, unknown>>()
    for (const row of accessResult.data || []) {
      const userId = normalizeText(row.user_id)
      if (userId && !accessByUserId.has(userId)) {
        accessByUserId.set(userId, row)
      }
    }

    const latestRedemptionByUserId = new Map<string, { keyId: number, redeemedAt: string | null }>()
    const activationKeyIds = new Set<number>()
    for (const row of keyRedemptionsResult.data || []) {
      const userId = normalizeText(row.user_id)
      const keyId = Number(row.key_id || 0)
      if (!userId || !keyId || latestRedemptionByUserId.has(userId)) continue
      latestRedemptionByUserId.set(userId, {
        keyId,
        redeemedAt: isoOrNull(row.redeemed_at),
      })
      activationKeyIds.add(keyId)
    }

    const activationKeyCodeById = new Map<number, string>()
    if (activationKeyIds.size) {
      const { data: activationKeys, error: activationKeyError } = await serviceClient
        .from("activation_keys")
        .select("id, code")
        .in("id", Array.from(activationKeyIds))
      if (activationKeyError) {
        return json({ error: "load_activation_keys_failed", detail: activationKeyError.message }, 500)
      }
      for (const row of activationKeys || []) {
        const id = Number(row.id || 0)
        if (id) activationKeyCodeById.set(id, normalizeText(row.code))
      }
    }

    const accounts = ((accountRows || []) as Record<string, unknown>[]).map((row) => {
      const userId = normalizeText(row.id)
      const access = accessByUserId.get(userId)
      const latestRedemption = latestRedemptionByUserId.get(userId)
      const siteLastSeenAt = isoOrNull(row.last_sign_in_at)
      const accessSource = normalizeText(access?.source) || null
      const accessGrantedAt = isoOrNull(access?.granted_at)
      const accessExpiresAt = isoOrNull(access?.expires_at)
      const isAccessEnabled = access?.is_active !== false
      const isAdmin = adminUserIds.has(userId)
      const accessState = isAdmin
        ? "admin"
        : !access || !isAccessEnabled
          ? "no_access"
          : accessExpiresAt && !isFuture(accessExpiresAt)
            ? "expired"
            : "active"
      return {
        userId,
        email: normalizeText(row.email) || null,
        username: profileByUserId.get(userId) || null,
        createdAt: isoOrNull(row.created_at),
        emailConfirmedAt: isoOrNull(row.email_confirmed_at),
        lastSignInAt: isoOrNull(row.last_sign_in_at),
        isAdmin,
        accessState,
        accessSource,
        accessGrantedAt,
        accessExpiresAt,
        latestKeyCode: latestRedemption ? activationKeyCodeById.get(latestRedemption.keyId) || null : null,
        latestKeyRedeemedAt: latestRedemption?.redeemedAt || null,
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

    const [
      { data: stripeRows, error: stripeError },
      { data: paddleRows, error: paddleError },
      { data: activationKeysRows, error: activationKeysError },
      { data: licenseKeyRows, error: licenseKeyError },
      { data: deviceActivationRows, error: deviceActivationError },
    ] = await Promise.all([
      serviceClient
        .from("stripe_subscriptions")
        .select("stripe_subscription_id, customer_email, status, current_period_starts_at, current_period_ends_at, canceled_at, activated_at, created_at, updated_at, activation_key_id, raw"),
      serviceClient
        .from("paddle_subscriptions")
        .select("paddle_subscription_id, customer_email, status, current_period_starts_at, current_period_ends_at, canceled_at, activated_at, created_at, updated_at, raw"),
      serviceClient
        .from("activation_keys")
        .select("id, code, created_for_email, is_active"),
      serviceClient
        .from("license_keys")
        .select("id, license_key, is_active, expires_at, license_type")
        .eq("license_type", "premium"),
      serviceClient
        .from("device_activations")
        .select("id, license_key_id"),
    ])

    if (stripeError) {
      return json({ error: "load_stripe_subscriptions_failed", detail: stripeError.message }, 500)
    }
    if (paddleError) {
      return json({ error: "load_paddle_subscriptions_failed", detail: paddleError.message }, 500)
    }
    if (activationKeysError) {
      return json({ error: "load_activation_keys_failed", detail: activationKeysError.message }, 500)
    }
    if (licenseKeyError) {
      return json({ error: "load_license_keys_failed", detail: licenseKeyError.message }, 500)
    }
    if (deviceActivationError) {
      return json({ error: "load_device_activations_failed", detail: deviceActivationError.message }, 500)
    }

    let liveStripeRows: SalesRow[] = []
    if (stripeSecretKey) {
      try {
        const stripeSubscriptions = await stripeListAll("/v1/subscriptions?status=all&expand[]=data.customer", stripeSecretKey)
        liveStripeRows = stripeSubscriptions
          .map((row) => buildStripeSubscriptionRow(row))
          .filter((row) => {
            if (!row.subscriptionId) return false
            if (!resetBaselineIso) return true
            const source = row.createdAt || row.activatedAt || row.currentPeriodStartsAt || row.currentPeriodEndsAt || null
            if (!source) return false
            const ts = new Date(source).getTime()
            return Number.isFinite(ts) && ts >= new Date(resetBaselineIso).getTime()
          })
      } catch (_error) {
        liveStripeRows = []
      }
    }

    const localStripeRows: SalesRow[] = ((stripeRows || []).map((row: Record<string, unknown>) => ({
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
      })) || []).map((row) => {
        const active = isBillingStillActive(row.status, row.currentPeriodEndsAt)
        const canceledButStillRunning = isCanceledButStillRunning(row.status, row.currentPeriodEndsAt, row.canceledAt, row.raw)
        return {
          ...row,
          active,
          canceledButStillRunning,
        }
      })
      .filter((row) => {
        if (!resetBaselineIso) return true
        const source = row.createdAt || row.activatedAt || row.currentPeriodStartsAt || row.currentPeriodEndsAt || null
        if (!source) return false
        const ts = new Date(source).getTime()
        return Number.isFinite(ts) && ts >= new Date(resetBaselineIso).getTime()
      })

    const mergedStripeById = new Map<string, SalesRow>()
    for (const row of liveStripeRows) {
      mergedStripeById.set(row.subscriptionId, row)
    }
    for (const row of localStripeRows) {
      if (!row.subscriptionId) continue
      const existing = mergedStripeById.get(row.subscriptionId)
      mergedStripeById.set(row.subscriptionId, existing
        ? {
            ...row,
            ...existing,
            customerEmail: existing.customerEmail || row.customerEmail,
            activatedAt: existing.activatedAt || row.activatedAt,
            createdAt: existing.createdAt || row.createdAt,
            updatedAt: existing.updatedAt || row.updatedAt,
          }
        : row)
    }

    const salesRows = [
      ...Array.from(mergedStripeById.values()),
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
      })) || []).filter((row) => {
        if (!resetBaselineIso) return true
        const source = row.createdAt || row.activatedAt || row.currentPeriodStartsAt || row.currentPeriodEndsAt || null
        if (!source) return false
        const ts = new Date(source).getTime()
        return Number.isFinite(ts) && ts >= new Date(resetBaselineIso).getTime()
      }),
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

    const activationKeyById = new Map<number, { code: string, createdForEmail: string | null, isActive: boolean }>()
    const activationKeyByCode = new Map<string, { id: number, createdForEmail: string | null, isActive: boolean }>()
    for (const row of activationKeysRows || []) {
      const id = Number(row.id || 0)
      const code = normalizeText(row.code)
      if (!id || !code) continue
      const record = {
        id,
        code,
        createdForEmail: normalizeText(row.created_for_email) || null,
        isActive: row.is_active === true,
      }
      activationKeyById.set(id, { code: record.code, createdForEmail: record.createdForEmail, isActive: record.isActive })
      activationKeyByCode.set(code, record)
    }

    const machineActivationCountByLicenseId = new Map<string, number>()
    for (const row of deviceActivationRows || []) {
      const licenseKeyId = normalizeText(row.license_key_id)
      if (!licenseKeyId) continue
      machineActivationCountByLicenseId.set(licenseKeyId, (machineActivationCountByLicenseId.get(licenseKeyId) || 0) + 1)
    }

    const licenseActivityByCode = new Map<string, { isActive: boolean, expiresAt: string | null, machineActivationCount: number }>()
    for (const row of licenseKeyRows || []) {
      const code = normalizeText(row.license_key)
      const licenseKeyId = normalizeText(row.id)
      if (!code || !licenseKeyId) continue
      licenseActivityByCode.set(code, {
        isActive: row.is_active === true,
        expiresAt: isoOrNull(row.expires_at),
        machineActivationCount: machineActivationCountByLicenseId.get(licenseKeyId) || 0,
      })
    }

    const latestStripeByEmail = new Map<string, {
      customerEmail: string
      status: string
      currentPeriodEndsAt: string | null
      updatedAt: string | null
      createdAt: string | null
      activationKeyId: number | null
    }>()
    for (const row of stripeRows || []) {
      const customerEmail = normalizeText(row.customer_email).toLowerCase()
      if (!customerEmail) continue
      const candidate = {
        customerEmail,
        status: normalizeText(row.status).toLowerCase(),
        currentPeriodEndsAt: isoOrNull(row.current_period_ends_at),
        updatedAt: isoOrNull(row.updated_at),
        createdAt: isoOrNull(row.created_at),
        activationKeyId: Number(row.activation_key_id || 0) || null,
      }
      const existing = latestStripeByEmail.get(customerEmail)
      if (!existing) {
        latestStripeByEmail.set(customerEmail, candidate)
        continue
      }

      const candidatePriority = subscriptionAuditPriority(candidate)
      const existingPriority = subscriptionAuditPriority(existing)
      const candidateTs = new Date(candidate.updatedAt || candidate.createdAt || 0).getTime()
      const existingTs = new Date(existing.updatedAt || existing.createdAt || 0).getTime()
      if (candidatePriority < existingPriority || (candidatePriority === existingPriority && candidateTs > existingTs)) {
        latestStripeByEmail.set(customerEmail, candidate)
      }
    }

    const subscriptionLicenseAudit: AuditRow[] = []
    const coveredLicenseCodes = new Set<string>()

    for (const row of latestStripeByEmail.values()) {
      const activationKey = row.activationKeyId ? activationKeyById.get(row.activationKeyId) || null : null
      const licenseActivity = activationKey ? licenseActivityByCode.get(activationKey.code) || null : null
      const subscriptionActive = isBillingStillActive(row.status, row.currentPeriodEndsAt)
      const machineActivationCount = licenseActivity?.machineActivationCount || 0
      const machineLicenseActive = !!(
        licenseActivity?.isActive
        && machineActivationCount > 0
        && (!licenseActivity.expiresAt || isFuture(licenseActivity.expiresAt))
      )
      if (activationKey?.code) coveredLicenseCodes.add(activationKey.code)
      subscriptionLicenseAudit.push({
        customerEmail: row.customerEmail || activationKey?.createdForEmail || "-",
        subscriptionActive,
        subscriptionStatus: row.status || "missing",
        activationKeyCode: activationKey?.code || null,
        machineLicenseActive,
        machineActivationCount,
        anomaly: machineLicenseActive && !subscriptionActive,
        anomalyReason: machineLicenseActive && !subscriptionActive ? "machine_active_without_subscription" : "none",
      })
    }

    for (const [licenseCode, licenseActivity] of licenseActivityByCode.entries()) {
      if (!licenseActivity.machineActivationCount || coveredLicenseCodes.has(licenseCode)) continue
      const activationKey = activationKeyByCode.get(licenseCode) || null
      const machineLicenseActive = !!(
        licenseActivity.isActive
        && licenseActivity.machineActivationCount > 0
        && (!licenseActivity.expiresAt || isFuture(licenseActivity.expiresAt))
      )
      subscriptionLicenseAudit.push({
        customerEmail: activationKey?.createdForEmail || "-",
        subscriptionActive: false,
        subscriptionStatus: "missing",
        activationKeyCode: licenseCode,
        machineLicenseActive,
        machineActivationCount: licenseActivity.machineActivationCount,
        anomaly: machineLicenseActive,
        anomalyReason: machineLicenseActive ? "machine_active_without_subscription" : "none",
      })
    }

    subscriptionLicenseAudit.sort((a, b) => {
      if (a.anomaly !== b.anomaly) return a.anomaly ? -1 : 1
      if (a.machineLicenseActive !== b.machineLicenseActive) return a.machineLicenseActive ? -1 : 1
      return a.customerEmail.localeCompare(b.customerEmail)
    })

    const salesSummary = {
      totalSubscriptions: salesRows.length,
      activeSubscriptions: salesRows.filter((row) => row.active).length,
      canceledButRunning: salesRows.filter((row) => row.canceledButStillRunning).length,
      endedSubscriptions: salesRows.filter((row) => !row.active).length,
      renewalsNext30Days: salesRows.filter((row) => row.active && endsWithinDays(row.currentPeriodEndsAt, 30)).length,
      billingIssueSubscriptions: salesRows.filter((row) => ["past_due", "unpaid", "paused"].includes(String(row.status || ""))).length,
      stripeSubscriptions: salesRows.filter((row) => row.provider === "stripe").length,
      paddleSubscriptions: salesRows.filter((row) => row.provider === "paddle").length,
    }

    const availableYears = Array.from(new Set([
      new Date().getUTCFullYear(),
      ...accounts.map((row) => {
        const source = row.createdAt || row.lastSignInAt || null
        if (!source) return null
        const dt = new Date(source)
        return Number.isNaN(dt.getTime()) ? null : dt.getUTCFullYear()
      }),
      ...salesRows.map((row) => {
        const source = row.activatedAt || row.createdAt || row.currentPeriodStartsAt || row.currentPeriodEndsAt || null
        if (!source) return null
        const dt = new Date(source)
        return Number.isNaN(dt.getTime()) ? null : dt.getUTCFullYear()
      }),
    ].filter((value): value is number => Number.isFinite(value))))
      .sort((a, b) => b - a)

    const requestedYear = Number(body?.year || 0)
    const selectedYear = availableYears.includes(requestedYear) ? requestedYear : availableYears[0] || new Date().getUTCFullYear()

    const annualSalesRows = salesRows.filter((row) => {
      const source = row.activatedAt || row.createdAt || row.currentPeriodStartsAt || null
      if (!source) return false
      const dt = new Date(source)
      return !Number.isNaN(dt.getTime()) && dt.getUTCFullYear() === selectedYear
    })

    let annualRevenueSummary = {
      year: selectedYear,
      currency: "EUR",
      revenueMinor: 0,
      revenueDisplay: formatMoneyMinorUnits(0, "EUR"),
      paidInvoices: 0,
      salesRecorded: annualSalesRows.length,
      stripeRevenueMinor: 0,
      paddleRevenueMinor: 0,
    }
    let annualRevenueTimeline = Array.from({ length: 12 }, (_value, index) => ({
      key: `${selectedYear}-${String(index + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(selectedYear, index, 1))),
      value: 0,
    }))

    if (stripeSecretKey) {
      const { startUnix, endUnix } = yearRange(selectedYear)
      const invoiceStartUnix = maxUnixTimestamp(startUnix, resetBaselineUnix)
      try {
        const invoices = await stripeListAll(`/v1/invoices?status=paid&created[gte]=${invoiceStartUnix || startUnix}&created[lte]=${endUnix}`, stripeSecretKey)
        const monthlyRevenue = new Map<string, number>()
        let totalMinor = 0
        let currency = "EUR"

        for (const invoice of invoices) {
          const paidAt = Number(((invoice.status_transitions || {}) as Record<string, unknown>).paid_at || 0)
          const iso = unixToIso(paidAt || invoice.created)
          if (!iso) continue
          const dt = new Date(iso)
          if (Number.isNaN(dt.getTime()) || dt.getUTCFullYear() !== selectedYear) continue
          const amountPaid = Number(invoice.amount_paid || 0)
          totalMinor += amountPaid
          currency = String(invoice.currency || currency).toUpperCase()
          const key = `${selectedYear}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`
          monthlyRevenue.set(key, (monthlyRevenue.get(key) || 0) + amountPaid)
        }

        annualRevenueTimeline = annualRevenueTimeline.map((row) => ({
          ...row,
          value: monthlyRevenue.get(row.key) || 0,
        }))

        annualRevenueSummary = {
          year: selectedYear,
          currency,
          revenueMinor: totalMinor,
          revenueDisplay: formatMoneyMinorUnits(totalMinor, currency),
          paidInvoices: invoices.length,
          salesRecorded: annualSalesRows.length,
          stripeRevenueMinor: totalMinor,
          paddleRevenueMinor: 0,
        }
      } catch (_error) {
        // Revenue stays available as zero rather than blocking the whole admin dashboard.
      }
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
      latestDownloads: 0,
      totalDownloads: 0,
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
            assetCount: Array.isArray(row.assets) ? row.assets.length : 0,
            downloadCount: Array.isArray(row.assets)
              ? row.assets.reduce((sum, asset) => {
                if (!asset || typeof asset !== "object") return sum
                const value = Number((asset as Record<string, unknown>).download_count)
                return sum + (Number.isFinite(value) ? value : 0)
              }, 0)
              : 0,
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
          latestDownloads: Number(latest?.downloadCount || 0),
          totalDownloads: releases.reduce((sum, row) => sum + Number(row.downloadCount || 0), 0),
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
      availableYears,
      selectedYear,
      annualRevenueSummary,
      annualRevenueTimeline,
      salesBreakdown,
      providerBreakdown,
      salesTimeline,
      subscriptions: salesRows,
      subscriptionLicenseAudit,
      releaseSummary,
    })
  } catch (error) {
    return json({
      error: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
