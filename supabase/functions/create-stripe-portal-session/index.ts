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
    if (!stripeSecretKey) {
      return json({ error: "missing_stripe_env" }, 500)
    }
    if (!token) {
      return json({ error: "not_authenticated" }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: userData, error: userError } = await adminClient.auth.getUser(token)
    const user = userData.user
    if (userError || !user || !user.email) {
      return json({ error: "not_authenticated" }, 401)
    }

    const { data: subscription, error: subscriptionError } = await adminClient
      .from("stripe_subscriptions")
      .select("stripe_customer_id")
      .eq("customer_email", user.email)
      .not("stripe_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subscriptionError) {
      return json({ error: "load_subscription_failed", detail: subscriptionError.message }, 500)
    }
    if (!subscription?.stripe_customer_id) {
      return json({ error: "no_billing_subscription" }, 400)
    }

    const body = await req.json().catch(() => ({}))
    const returnUrl = String(body.returnUrl || "").trim() || "https://riftskin.com/account.html"
    const portalSession = await stripeRequest("/v1/billing_portal/sessions", stripeSecretKey, new URLSearchParams({
      customer: subscription.stripe_customer_id,
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
