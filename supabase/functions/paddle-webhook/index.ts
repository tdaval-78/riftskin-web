import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, paddle-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const paddleNotePrefix = "[paddle-subscription:"

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

function toIsoOrNull(value: unknown) {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function getHeader(req: Request, name: string) {
  return req.headers.get(name) || req.headers.get(name.toLowerCase()) || ""
}

function parseSignatureHeader(header: string) {
  const entries = header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const [key, ...rest] = part.split("=")
      if (key && rest.length) acc[key] = rest.join("=")
      return acc
    }, {})

  return {
    timestamp: entries.ts || "",
    h1: entries.h1 || "",
  }
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

async function computeHmac(secret: string, payload: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string) {
  const { timestamp, h1 } = parseSignatureHeader(signatureHeader)
  if (!timestamp || !h1) return false
  const signedPayload = `${timestamp}:${rawBody}`
  const expected = await computeHmac(secret, signedPayload)
  return timingSafeEqual(expected, h1)
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function subscriptionStatusFromEvent(eventType: string, data: Record<string, unknown>) {
  const explicit = String(data.status || "").trim().toLowerCase()
  if (explicit) return explicit

  if (eventType.startsWith("subscription.")) {
    return eventType.replace("subscription.", "").replace("_", "-")
  }

  return ""
}

function getCurrentPeriod(data: Record<string, unknown>) {
  const period = (data.current_billing_period || data.billing_period || null) as Record<string, unknown> | null
  const scheduledChange = (data.scheduled_change || null) as Record<string, unknown> | null
  return {
    startsAt: toIsoOrNull(period?.starts_at || period?.from),
    endsAt: toIsoOrNull(period?.ends_at || period?.to || data.next_billed_at || scheduledChange?.effective_at),
  }
}

function isAccessActive(status: string, endsAt: string | null) {
  if (["active", "trialing"].includes(status)) return true
  if (["canceled", "cancelled", "past_due", "paused"].includes(status) && endsAt) {
    return new Date(endsAt).getTime() > Date.now()
  }
  return false
}

async function findUserIdByEmail(adminClient: any, email: string) {
  if (!email) return null

  const { data, error } = await adminClient
    .schema("auth")
    .from("users")
    .select("id")
    .ilike("email", email)
    .limit(1)

  if (error) {
    throw error
  }

  return data?.[0]?.id || null
}

async function getAppAdminId(adminClient: any) {
  const { data, error } = await adminClient
    .from("app_admins")
    .select("user_id")
    .limit(1)

  if (error) throw error
  return data?.[0]?.user_id || null
}

async function ensureActivationKey(adminClient: any, params: {
  adminUserId: string
  subscriptionId: string
  customerEmail: string
  accessEndsAt: string | null
  existingKeyId?: number | null
}) {
  const note = `${paddleNotePrefix}${params.subscriptionId}]`
  const active = !params.accessEndsAt || new Date(params.accessEndsAt).getTime() > Date.now()

  if (params.existingKeyId) {
    const { data, error } = await adminClient
      .from("activation_keys")
      .update({
        created_for_email: params.customerEmail,
        note,
        expires_at: params.accessEndsAt,
        is_active: active,
      })
      .eq("id", params.existingKeyId)
      .select("id, code, expires_at, is_active")
      .single()

    if (error) throw error
    return data
  }

  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase().replace(/(.{4})/g, "$1-").replace(/-$/, "")
  const { data, error } = await adminClient
    .from("activation_keys")
    .insert({
      code,
      created_by: params.adminUserId,
      created_for_email: params.customerEmail,
      note,
      max_uses: 1,
      grant_months: 1,
      grant_days: 30,
      valid_months: 120,
      expires_at: params.accessEndsAt,
      is_active: active,
    })
    .select("id, code, expires_at, is_active")
    .single()

  if (error) throw error
  return data
}

async function upsertSubscriptionRow(adminClient: any, params: Record<string, unknown>) {
  const { data, error } = await adminClient
    .from("paddle_subscriptions")
    .upsert(params, { onConflict: "paddle_subscription_id" })
    .select("*")
    .single()

  if (error) throw error
  return data
}

async function ensureUserAccess(adminClient: any, userId: string, keyId: number, accessEndsAt: string | null, active: boolean) {
  const { error } = await adminClient
    .from("user_access")
    .upsert({
      user_id: userId,
      source: "activation_key",
      granted_by_key_id: keyId,
      granted_at: new Date().toISOString(),
      expires_at: accessEndsAt,
      is_active: active,
    }, { onConflict: "user_id" })

  if (error) throw error
}

async function ensureRedemption(adminClient: any, keyId: number, userId: string) {
  const { data, error } = await adminClient
    .from("key_redemptions")
    .select("id")
    .eq("key_id", keyId)
    .eq("user_id", userId)
    .limit(1)

  if (error) throw error
  if (data?.length) return

  const { error: insertError } = await adminClient
    .from("key_redemptions")
    .insert({ key_id: keyId, user_id: userId })

  if (insertError) throw insertError

  const { data: keyRow, error: loadKeyError } = await adminClient
    .from("activation_keys")
    .select("used_count")
    .eq("id", keyId)
    .single()

  if (loadKeyError) throw loadKeyError

  const nextUsedCount = Number(keyRow?.used_count || 0) + 1
  const { error: updateError } = await adminClient
    .from("activation_keys")
    .update({ used_count: nextUsedCount })
    .eq("id", keyId)

  if (updateError) throw updateError
}

function extractSubscriptionPayload(eventType: string, payload: Record<string, unknown>) {
  const data = (payload.data || {}) as Record<string, unknown>
  const customData = (data.custom_data || {}) as Record<string, unknown>
  const transaction = (data.transaction_details || data.transaction || {}) as Record<string, unknown>
  const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : []
  const firstItem = items[0] || {}
  const period = getCurrentPeriod(data)

  const customerEmail =
    normalizeEmail(data.customer_email) ||
    normalizeEmail((data.customer as Record<string, unknown> | undefined)?.email) ||
    normalizeEmail((transaction.customer as Record<string, unknown> | undefined)?.email) ||
    normalizeEmail(customData.email)

  const subscriptionId =
    String(data.id || data.subscription_id || transaction.subscription_id || "").trim()

  const customerId =
    String(data.customer_id || (data.customer as Record<string, unknown> | undefined)?.id || transaction.customer_id || "").trim() || null

  const status = subscriptionStatusFromEvent(eventType, data)
  const priceId =
    String(firstItem.price_id || data.price_id || transaction.price_id || "").trim() || null
  const productId =
    String(firstItem.product_id || data.product_id || transaction.product_id || "").trim() || null
  const transactionId =
    String(transaction.id || data.transaction_id || payload.id || "").trim() || null

  return {
    data,
    eventId: String(payload.event_id || payload.notification_id || payload.id || "").trim() || null,
    eventOccurredAt: toIsoOrNull(payload.occurred_at || payload.event_time || data.updated_at || data.created_at) || new Date().toISOString(),
    subscriptionId,
    customerId,
    customerEmail,
    status,
    priceId,
    productId,
    transactionId,
    currentPeriodStartsAt: period.startsAt,
    currentPeriodEndsAt: period.endsAt,
    canceledAt: toIsoOrNull(data.canceled_at),
    activatedAt: toIsoOrNull(data.activated_at),
    trialingAt: toIsoOrNull(data.started_at),
    pausedAt: toIsoOrNull(data.paused_at),
  }
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
    const webhookSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET")

    if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
      return json({ error: "missing_env" }, 500)
    }

    const rawBody = await req.text()
    const signatureHeader = getHeader(req, "Paddle-Signature")

    const validSignature = await verifyWebhookSignature(rawBody, signatureHeader, webhookSecret)
    if (!validSignature) {
      return json({ error: "invalid_signature" }, 401)
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>
    const eventType = String(payload.event_type || "").trim()

    if (!eventType) {
      return json({ error: "missing_event_type" }, 400)
    }

    if (!eventType.startsWith("subscription.") && !eventType.startsWith("transaction.")) {
      return json({ ok: true, ignored: true, eventType })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const extracted = extractSubscriptionPayload(eventType, payload)
    if (!extracted.subscriptionId || !extracted.customerEmail) {
      return json({
        ok: true,
        ignored: true,
        reason: "missing_subscription_identity",
        eventType,
      })
    }

    const adminUserId = await getAppAdminId(adminClient)
    if (!adminUserId) {
      return json({ error: "missing_app_admin" }, 500)
    }

    const existing = await adminClient
      .from("paddle_subscriptions")
      .select("id, activation_key_id")
      .eq("paddle_subscription_id", extracted.subscriptionId)
      .maybeSingle()

    if (existing.error) {
      return json({ error: "load_subscription_failed", detail: existing.error.message }, 500)
    }

    const active = isAccessActive(extracted.status, extracted.currentPeriodEndsAt)
    const activationKey = await ensureActivationKey(adminClient, {
      adminUserId,
      subscriptionId: extracted.subscriptionId,
      customerEmail: extracted.customerEmail,
      accessEndsAt: extracted.currentPeriodEndsAt,
      existingKeyId: existing.data?.activation_key_id || null,
    })

    const saved = await upsertSubscriptionRow(adminClient, {
      paddle_subscription_id: extracted.subscriptionId,
      paddle_customer_id: extracted.customerId,
      customer_email: extracted.customerEmail,
      status: extracted.status || eventType,
      product_id: extracted.productId,
      price_id: extracted.priceId,
      current_period_starts_at: extracted.currentPeriodStartsAt,
      current_period_ends_at: extracted.currentPeriodEndsAt,
      canceled_at: extracted.canceledAt,
      activated_at: extracted.activatedAt,
      trialing_at: extracted.trialingAt,
      paused_at: extracted.pausedAt,
      last_transaction_id: extracted.transactionId,
      activation_key_id: activationKey.id,
      notification_setting_id: "ntfset_01kmt2ggmgfq1wqwqrgetgf48v",
      last_event_id: extracted.eventId,
      last_event_type: eventType,
      last_event_at: extracted.eventOccurredAt,
      raw: payload,
      updated_at: new Date().toISOString(),
    })

    const userId = await findUserIdByEmail(adminClient, extracted.customerEmail)
    if (userId) {
      await ensureRedemption(adminClient, activationKey.id, userId)
      await ensureUserAccess(adminClient, userId, activationKey.id, extracted.currentPeriodEndsAt, active)
    }

    return json({
      ok: true,
      eventType,
      subscriptionId: extracted.subscriptionId,
      customerEmail: extracted.customerEmail,
      activationKeyCode: activationKey.code,
      active,
      billingRowId: saved.id,
    })
  } catch (error) {
    return json({
      error: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
