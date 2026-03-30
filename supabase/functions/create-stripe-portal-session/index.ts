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

function decodeJwtPayload(token: string) {
  const parts = token.split(".")
  if (parts.length < 2) return null
  const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4)
  try {
    const jsonPayload = new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)))
    return JSON.parse(jsonPayload) as Record<string, unknown>
  } catch {
    return null
  }
}

async function stripeRequest(path: string, apiKey: string, body?: URLSearchParams) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? body.toString() : undefined,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = payload?.error?.message || `Stripe request failed: ${path}`
    throw new Error(detail)
  }
  return payload
}

function billingFooter() {
  return "TVA non applicable, article 293 B du CGI"
}

async function findCustomerIdByEmail(apiKey: string, email: string) {
  const payload = await stripeRequest(`/v1/customers?email=${encodeURIComponent(email)}&limit=10`, apiKey)
  const rows = Array.isArray(payload.data) ? payload.data : []
  return String(rows[0]?.id || "").trim() || null
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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "missing_supabase_env" }, 500)
    }
    if (!stripeSecretKey) {
      return json({ error: "missing_stripe_env" }, 500)
    }
    if (!token) {
      return json({ error: "not_authenticated" }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const claims = decodeJwtPayload(token)
    const userEmail = String(claims?.email || "").trim().toLowerCase()
    if (!userEmail) {
      return json({ error: "not_authenticated" }, 401)
    }

    const { data: subscription, error: subscriptionError } = await adminClient
      .from("stripe_subscriptions")
      .select("stripe_customer_id")
      .eq("customer_email", userEmail)
      .not("stripe_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subscriptionError) {
      return json({ error: "load_subscription_failed", detail: subscriptionError.message }, 500)
    }
    const customerId = subscription?.stripe_customer_id || await findCustomerIdByEmail(stripeSecretKey, userEmail)
    if (!customerId) return json({ error: "no_billing_subscription" }, 400)

    await stripeRequest(`/v1/customers/${customerId}`, stripeSecretKey, new URLSearchParams({
      "invoice_settings[footer]": billingFooter(),
    }))

    const body = await req.json().catch(() => ({}))
    const returnUrl = String(body.returnUrl || "").trim() || "https://riftskin.com/account.html"
    const portalSession = await stripeRequest("/v1/billing_portal/sessions", stripeSecretKey, new URLSearchParams({
      customer: customerId,
      return_url: returnUrl,
    }))

    return json({ ok: true, url: portalSession.url })
  } catch (error) {
    return json({
      error: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
