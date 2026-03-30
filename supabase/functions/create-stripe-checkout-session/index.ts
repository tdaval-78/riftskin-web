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

async function findExistingCustomerId(adminClient: any, email: string) {
  const { data, error } = await adminClient
    .from("stripe_subscriptions")
    .select("stripe_customer_id")
    .eq("customer_email", email)
    .not("stripe_customer_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.stripe_customer_id || null
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
    const stripePriceId = Deno.env.get("STRIPE_PRICE_ID")
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "missing_supabase_env" }, 500)
    }
    if (!stripeSecretKey || !stripePriceId) {
      return json({ error: "missing_stripe_env" }, 500)
    }
    if (!token) {
      return json({ error: "not_authenticated" }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const claims = decodeJwtPayload(token)
    const userId = String(claims?.sub || "").trim()
    const userEmail = String(claims?.email || "").trim().toLowerCase()
    if (!userId || !userEmail) {
      return json({ error: "not_authenticated" }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const successUrl = String(body.successUrl || "").trim() || "https://riftskin.com/account.html?checkout=success"
    const cancelUrl = String(body.cancelUrl || "").trim() || "https://riftskin.com/pricing.html?checkout=canceled"

    let customerId = await findExistingCustomerId(adminClient, userEmail)
    if (!customerId) {
      const customer = await stripeRequest("/v1/customers", stripeSecretKey, new URLSearchParams({
        email: userEmail,
        "metadata[supabase_user_id]": userId,
        "metadata[app]": "riftskin",
      }))
      customerId = customer.id
    }

    const params = new URLSearchParams({
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: customerId,
      "line_items[0][price]": stripePriceId,
      "line_items[0][quantity]": "1",
      "allow_promotion_codes": "true",
      "metadata[supabase_user_id]": userId,
      "metadata[email]": userEmail,
      "metadata[source]": "riftskin-web",
      "subscription_data[metadata][supabase_user_id]": userId,
      "subscription_data[metadata][email]": userEmail,
      "subscription_data[metadata][source]": "riftskin-web",
    })

    const session = await stripeRequest("/v1/checkout/sessions", stripeSecretKey, params)
    return json({ ok: true, id: session.id, url: session.url })
  } catch (error) {
    return json({
      error: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
