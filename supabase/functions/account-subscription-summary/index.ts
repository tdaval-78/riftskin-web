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

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function unixToIso(value: unknown) {
  const parsed = Number(value || 0)
  if (!parsed) return null
  const date = new Date(parsed * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isAccessActive(status: string, endsAt: string | null) {
  if (["active", "trialing"].includes(status)) return true
  if (["canceled", "cancelled", "past_due", "paused", "unpaid"].includes(status) && endsAt) {
    return new Date(endsAt).getTime() > Date.now()
  }
  return false
}

function getNotificationState(raw: unknown) {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  const existing = record._riftskin_notifications
  return existing && typeof existing === "object" ? existing as Record<string, unknown> : {}
}

function isCancellationScheduled(raw: unknown) {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  return record.cancel_at_period_end === true || !!record.cancel_at
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
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "missing_env" }, 500)
    }
    if (!token) {
      return json({ error: "not_authenticated" }, 401)
    }

    const claims = decodeJwtPayload(token)
    const role = String(claims?.role || "").trim()
    const authEmail = normalizeEmail(claims?.email)
    const body = await req.json().catch(() => ({}))
    const requestedEmail = normalizeEmail(body.email)
    const targetEmail = requestedEmail || authEmail

    if (!targetEmail) {
      return json({ error: "missing_email" }, 400)
    }
    if (role !== "service_role" && authEmail !== targetEmail) {
      return json({ error: "forbidden" }, 403)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data, error } = await adminClient
      .from("stripe_subscriptions")
      .select("id, stripe_subscription_id, status, current_period_starts_at, current_period_ends_at, canceled_at, activation_key_id, raw, updated_at")
      .eq("customer_email", targetEmail)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return json({ error: "load_subscription_failed", detail: error.message }, 500)
    }

    if (!data) {
      return json({ ok: true, email: targetEmail, subscription: null })
    }

    const status = String(data.status || "").trim().toLowerCase()
    const currentPeriodEndsAt = data.current_period_ends_at ? String(data.current_period_ends_at) : null
    const cancellationScheduled = isCancellationScheduled(data.raw)
    const active = isAccessActive(status, currentPeriodEndsAt)
    const raw = data.raw && typeof data.raw === "object" ? data.raw as Record<string, unknown> : {}
    const notificationState = getNotificationState(raw)

    return json({
      ok: true,
      email: targetEmail,
      subscription: {
        id: data.id,
        stripeSubscriptionId: data.stripe_subscription_id,
        status,
        active,
        currentPeriodStartsAt: data.current_period_starts_at,
        currentPeriodEndsAt,
        canceledAt: data.canceled_at,
        cancellationScheduled,
        cancelAt: unixToIso(raw.cancel_at),
        cancelAtPeriodEnd: raw.cancel_at_period_end === true,
        activationKeyId: data.activation_key_id,
        updatedAt: data.updated_at,
        notifications: notificationState,
      },
    })
  } catch (error) {
    return json({
      error: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
