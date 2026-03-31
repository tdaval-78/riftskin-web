import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const expectedConfirmationText = "YES, I WANT TO DELETE MY ACCOUNT AND DATA"

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function unixToIso(value: unknown) {
  const parsed = Number(value || 0)
  if (!parsed) return null
  const date = new Date(parsed * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isBillingStillActive(status: string, endsAt: string | null) {
  if (["active", "trialing"].includes(status)) return true
  if (["canceled", "cancelled", "past_due", "paused", "unpaid"].includes(status) && endsAt) {
    return new Date(endsAt).getTime() > Date.now()
  }
  return false
}

async function stripeRequest(path: string, apiKey: string) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = payload?.error?.message || `Stripe request failed: ${path}`
    throw new Error(detail)
  }
  return payload
}

async function hasActiveStripeBilling(email: string, apiKey: string) {
  const customersPayload = await stripeRequest(`/v1/customers?email=${encodeURIComponent(email)}&limit=10`, apiKey)
  const customers = Array.isArray(customersPayload.data) ? customersPayload.data : []

  for (const customer of customers) {
    const customerId = String(customer?.id || "").trim()
    if (!customerId) continue

    const subsPayload = await stripeRequest(`/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=20`, apiKey)
    const subscriptions = Array.isArray(subsPayload.data) ? subsPayload.data : []

    for (const subscription of subscriptions) {
      const items = (((subscription.items || {}) as Record<string, unknown>).data || []) as Array<Record<string, unknown>>
      const firstItem = items[0] || {}
      const endsAt = unixToIso(subscription.current_period_end || firstItem.current_period_end)
      const status = String(subscription.status || "").trim().toLowerCase()
      if (isBillingStillActive(status, endsAt)) {
        return true
      }
    }
  }

  return false
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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "missing_supabase_env" }, 500)
    }

    if (!token) {
      return json({ error: "not_authenticated" }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const password = String(body.password || "")
    const confirmationText = String(body.confirmationText || "").trim()

    if (!password) {
      return json({ ok: false, error: "missing_password" })
    }

    if (confirmationText !== expectedConfirmationText) {
      return json({ ok: false, error: "invalid_confirmation_text" })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: userData, error: userError } = await adminClient.auth.getUser(token)
    const user = userData.user

    if (userError || !user) {
      return json({ error: "not_authenticated" }, 401)
    }

    const publicClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    })

    const { error: passwordError } = await publicClient.auth.signInWithPassword({
      email: user.email || "",
      password,
    })

    if (passwordError) {
      return json({ ok: false, error: "invalid_password" })
    }

    const { data: accessRows, error: accessError } = await adminClient
      .from("user_access")
      .select("source, expires_at, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)

    if (accessError) {
      return json({ error: "access_check_failed" }, 500)
    }

    const activeAccess = (accessRows || []).find((row: any) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now())
    if (activeAccess && activeAccess.source !== "admin_grant") {
      return json({ ok: false, error: "active_subscription" })
    }

    const userEmail = normalizeEmail(user.email)
    const { data: billingRows, error: billingError } = await adminClient
      .from("stripe_subscriptions")
      .select("status, current_period_ends_at")
      .eq("customer_email", userEmail)
      .order("updated_at", { ascending: false })
      .limit(20)

    if (billingError) {
      return json({ error: "billing_check_failed" }, 500)
    }

    const localActiveBilling = (billingRows || []).some((row: any) => {
      return isBillingStillActive(String(row.status || "").trim().toLowerCase(), row.current_period_ends_at ? String(row.current_period_ends_at) : null)
    })
    if (localActiveBilling) {
      return json({ ok: false, error: "active_subscription" })
    }

    if (stripeSecretKey && userEmail) {
      const remoteActiveBilling = await hasActiveStripeBilling(userEmail, stripeSecretKey)
      if (remoteActiveBilling) {
        return json({ ok: false, error: "active_subscription" })
      }
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
    if (deleteError) {
      return json({ error: "delete_failed", detail: deleteError.message || null }, 500)
    }

    return json({ ok: true })
  } catch (error) {
    return json({
      error: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
