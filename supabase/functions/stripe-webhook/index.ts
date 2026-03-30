import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const legacyBillingNotePrefix = "[paddle-subscription:"

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

function parseStripeSignature(header: string) {
  const values = header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string[]>>((acc, part) => {
      const [key, ...rest] = part.split("=")
      if (!key || !rest.length) return acc
      acc[key] = acc[key] || []
      acc[key].push(rest.join("="))
      return acc
    }, {})

  return {
    timestamp: values.t?.[0] || "",
    signatures: values.v1 || [],
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
  const { timestamp, signatures } = parseStripeSignature(signatureHeader)
  if (!timestamp || !signatures.length) return false
  const signedPayload = `${timestamp}.${rawBody}`
  const expected = await computeHmac(secret, signedPayload)
  return signatures.some((signature) => timingSafeEqual(expected, signature))
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

function firstNonEmpty<T>(...values: Array<T | null | undefined>) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return value
  }
  return null
}

function getHeader(req: Request, name: string) {
  return req.headers.get(name) || req.headers.get(name.toLowerCase()) || ""
}

function isAccessActive(status: string, endsAt: string | null) {
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

async function findUserIdByEmail(adminClient: any, email: string) {
  if (!email) return null

  const { data, error } = await adminClient
    .schema("auth")
    .from("users")
    .select("id")
    .ilike("email", email)
    .limit(1)

  if (error) throw error
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
  const note = `${legacyBillingNotePrefix}${params.subscriptionId}]`
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

async function upsertSubscriptionRow(adminClient: any, params: Record<string, unknown>) {
  const { data, error } = await adminClient
    .from("stripe_subscriptions")
    .upsert(params, { onConflict: "stripe_subscription_id" })
    .select("*")
    .single()

  if (error) throw error
  return data
}

function formatParisDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" })
}

async function sendBillingEmail(params: {
  toEmail: string
  subject: string
  html: string
  text: string
}) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY")
  if (!resendApiKey) {
    return { sent: false, reason: "missing_resend_api_key" }
  }

  const fromEmail = Deno.env.get("BILLING_FROM_EMAIL")
    || Deno.env.get("SUPPORT_FROM_EMAIL")
    || "RIFTSKIN Billing <onboarding@resend.dev>"
  const replyToEmail = Deno.env.get("SUPPORT_TO_EMAIL") || "support@riftskin.com"

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [params.toEmail],
      reply_to: replyToEmail,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`resend_error:${response.status}:${errorText}`)
  }

  const payload = await response.json().catch(() => ({}))
  return { sent: true, id: payload.id || null }
}

async function sendPremiumKeyEmail(params: {
  toEmail: string
  activationKeyCode: string
  currentPeriodEndsAt: string | null
}) {
  const cycleEnd = formatParisDate(params.currentPeriodEndsAt)

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
      <h2 style="margin:0 0 12px;">Bienvenue sur RIFTSKIN Premium</h2>
      <p>Votre paiement a bien ete confirme.</p>
      <p><strong>Votre licence Premium :</strong></p>
      <div style="font-size:28px;font-weight:700;letter-spacing:1px;background:#0f172a;color:#f8fafc;border-radius:14px;padding:18px 20px;display:inline-block;">
        ${params.activationKeyCode}
      </div>
      <p style="margin-top:18px;">Cette meme licence reste valable tant que votre abonnement est actif.</p>
      ${cycleEnd ? `<p>Fin de la periode de facturation en cours : <strong>${cycleEnd}</strong></p>` : ""}
      <p><strong>TVA non applicable, article 293 B du CGI.</strong></p>
      <p>Vous pouvez aussi retrouver cette licence dans votre compte RIFTSKIN, onglet abonnement / licence, puis la renseigner dans l'application desktop.</p>
      <p style="margin-top:20px;">Besoin d'aide ? Repondez a cet email ou contactez le support RIFTSKIN.</p>
    </div>
  `.trim()

  const text = [
    "Bienvenue sur RIFTSKIN Premium",
    "",
    "Votre paiement a bien ete confirme.",
    `Votre licence Premium : ${params.activationKeyCode}`,
    "Cette meme licence reste valable tant que votre abonnement est actif.",
    cycleEnd ? `Fin de la periode de facturation en cours : ${cycleEnd}` : "",
    "TVA non applicable, article 293 B du CGI.",
    "Vous pouvez aussi retrouver cette licence dans votre compte RIFTSKIN et la renseigner dans l'application desktop.",
  ].filter(Boolean).join("\n")

  return sendBillingEmail({
    toEmail: params.toEmail,
    subject: "Votre licence RIFTSKIN Premium",
    html,
    text,
  })
}

async function sendCancellationAcknowledgedEmail(params: {
  toEmail: string
  currentPeriodEndsAt: string | null
}) {
  const cycleEnd = formatParisDate(params.currentPeriodEndsAt)
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
      <h2 style="margin:0 0 12px;">Annulation de votre abonnement RIFTSKIN Premium</h2>
      <p>Votre demande d'annulation a bien ete prise en compte.</p>
      ${cycleEnd ? `<p>Votre acces premium reste actif jusqu'au <strong>${cycleEnd}</strong>.</p>` : "<p>Votre acces premium reste actif jusqu'a la fin de la periode deja reglee.</p>"}
      <p>Votre licence reste la meme pendant cette periode et reste disponible dans votre compte RIFTSKIN.</p>
      <p><strong>TVA non applicable, article 293 B du CGI.</strong></p>
    </div>
  `.trim()
  const text = [
    "Annulation de votre abonnement RIFTSKIN Premium",
    "",
    "Votre demande d'annulation a bien ete prise en compte.",
    cycleEnd ? `Votre acces premium reste actif jusqu'au ${cycleEnd}.` : "Votre acces premium reste actif jusqu'a la fin de la periode deja reglee.",
    "Votre licence reste la meme pendant cette periode et reste disponible dans votre compte RIFTSKIN.",
    "TVA non applicable, article 293 B du CGI.",
  ].join("\n")
  return sendBillingEmail({
    toEmail: params.toEmail,
    subject: "Annulation prise en compte - RIFTSKIN Premium",
    html,
    text,
  })
}

async function sendSubscriptionExpiredEmail(params: {
  toEmail: string
}) {
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
      <h2 style="margin:0 0 12px;">Abonnement RIFTSKIN Premium termine</h2>
      <p>Votre abonnement premium est maintenant termine et l'acces premium a expire.</p>
      <p>Votre compte web reste disponible, et vous pourrez vous reabonner a tout moment pour reactiver votre licence.</p>
      <p><strong>TVA non applicable, article 293 B du CGI.</strong></p>
    </div>
  `.trim()
  const text = [
    "Abonnement RIFTSKIN Premium termine",
    "",
    "Votre abonnement premium est maintenant termine et l'acces premium a expire.",
    "Votre compte web reste disponible, et vous pourrez vous reabonner a tout moment pour reactiver votre licence.",
    "TVA non applicable, article 293 B du CGI.",
  ].join("\n")
  return sendBillingEmail({
    toEmail: params.toEmail,
    subject: "Abonnement termine - RIFTSKIN Premium",
    html,
    text,
  })
}

function getNotificationState(raw: unknown) {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  const existing = record._riftskin_notifications
  return existing && typeof existing === "object" ? existing as Record<string, unknown> : {}
}

async function getCustomerEmail(customerId: string | null, apiKey: string) {
  if (!customerId) return null
  const customer = await stripeRequest(`/v1/customers/${customerId}`, apiKey)
  return normalizeEmail(customer.email)
}

async function buildSubscriptionSnapshot(eventType: string, payload: Record<string, unknown>, apiKey: string) {
  const eventObject = (payload.data || {}) as Record<string, unknown>
  const object = (eventObject.object || {}) as Record<string, unknown>
  let subscription = object

  if (eventType === "checkout.session.completed") {
    const subscriptionId = String(object.subscription || "").trim()
    if (!subscriptionId) {
      return {
        ignored: true,
        reason: "missing_subscription_id",
      }
    }
    subscription = await stripeRequest(`/v1/subscriptions/${subscriptionId}`, apiKey)
  }

  if (String(subscription.object || "") !== "subscription") {
    return {
      ignored: true,
      reason: "unsupported_object",
    }
  }

  const items = (((subscription.items || {}) as Record<string, unknown>).data || []) as Array<Record<string, unknown>>
  const firstItem = items[0] || {}
  const price = (firstItem.price || {}) as Record<string, unknown>
  const product = price.product
  const customerId = String(subscription.customer || "").trim() || null

  const customerEmail =
    normalizeEmail(subscription.metadata && (subscription.metadata as Record<string, unknown>).email) ||
    await getCustomerEmail(customerId, apiKey)

  const currentPeriodStartsAt = unixToIso(firstNonEmpty(
    subscription.current_period_start,
    firstItem.current_period_start,
  ))
  const currentPeriodEndsAt = eventType === "customer.subscription.deleted"
    ? unixToIso(firstNonEmpty(
      subscription.ended_at,
      subscription.canceled_at,
      subscription.current_period_end,
      firstItem.current_period_end,
    ))
    : unixToIso(firstNonEmpty(
      subscription.current_period_end,
      firstItem.current_period_end,
    ))

  return {
    ignored: false,
    subscriptionId: String(subscription.id || "").trim(),
    customerId,
    customerEmail,
    status: String(subscription.status || eventType).trim().toLowerCase(),
    priceId: String(price.id || "").trim() || null,
    productId: typeof product === "string" ? product : String((product as Record<string, unknown> | null)?.id || "").trim() || null,
    currentPeriodStartsAt,
    currentPeriodEndsAt,
    canceledAt: unixToIso(subscription.canceled_at),
    activatedAt: unixToIso(subscription.start_date),
    trialingAt: unixToIso(subscription.trial_start),
    pausedAt: unixToIso(((subscription.pause_collection || {}) as Record<string, unknown>).resumes_at),
    raw: subscription,
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
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")

    if (!supabaseUrl || !serviceRoleKey || !webhookSecret || !stripeSecretKey) {
      return json({ error: "missing_env" }, 500)
    }

    const rawBody = await req.text()
    const signatureHeader = getHeader(req, "Stripe-Signature")
    const validSignature = await verifyWebhookSignature(rawBody, signatureHeader, webhookSecret)
    if (!validSignature) {
      return json({ error: "invalid_signature" }, 401)
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>
    const eventType = String(payload.type || "").trim()
    if (!eventType) {
      return json({ error: "missing_event_type" }, 400)
    }

    if (!["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(eventType)) {
      return json({ ok: true, ignored: true, eventType })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const snapshot = await buildSubscriptionSnapshot(eventType, payload, stripeSecretKey)
    if (snapshot.ignored) {
      return json({ ok: true, ignored: true, eventType, reason: snapshot.reason })
    }
    if (!snapshot.subscriptionId || !snapshot.customerEmail) {
      return json({ ok: true, ignored: true, eventType, reason: "missing_subscription_identity" })
    }

    const adminUserId = await getAppAdminId(adminClient)
    if (!adminUserId) {
      return json({ error: "missing_app_admin" }, 500)
    }

    const existing = await adminClient
      .from("stripe_subscriptions")
      .select("id, activation_key_id, last_event_id, raw, status, current_period_ends_at")
      .eq("stripe_subscription_id", snapshot.subscriptionId)
      .maybeSingle()

    if (existing.error) {
      return json({ error: "load_subscription_failed", detail: existing.error.message }, 500)
    }

    const eventId = String(payload.id || "").trim() || null
    if (eventId && existing.data?.last_event_id === eventId) {
      return json({ ok: true, ignored: true, eventType, reason: "duplicate_event", subscriptionId: snapshot.subscriptionId })
    }

    const existingNotificationState = getNotificationState(existing.data?.raw)
    const existingActive = isAccessActive(String(existing.data?.status || ""), existing.data?.current_period_ends_at ? String(existing.data.current_period_ends_at) : null)
    const active = isAccessActive(snapshot.status, snapshot.currentPeriodEndsAt)
    const activationKey = await ensureActivationKey(adminClient, {
      adminUserId,
      subscriptionId: snapshot.subscriptionId,
      customerEmail: snapshot.customerEmail,
      accessEndsAt: snapshot.currentPeriodEndsAt,
      existingKeyId: existing.data?.activation_key_id || null,
    })

    let statusEmail = null
    const nextNotificationState: Record<string, unknown> = { ...existingNotificationState }

    if (
      ["canceled", "cancelled"].includes(snapshot.status) &&
      active &&
      existingNotificationState.cancellation_period_end !== snapshot.currentPeriodEndsAt
    ) {
      statusEmail = await sendCancellationAcknowledgedEmail({
        toEmail: snapshot.customerEmail,
        currentPeriodEndsAt: snapshot.currentPeriodEndsAt,
      })
      nextNotificationState.cancellation_period_end = snapshot.currentPeriodEndsAt
    }

    if (
      existingActive &&
      !active &&
      existingNotificationState.expired_event_id !== eventId
    ) {
      statusEmail = await sendSubscriptionExpiredEmail({
        toEmail: snapshot.customerEmail,
      })
      nextNotificationState.expired_event_id = eventId
    }

    const rawWithNotifications = {
      ...(snapshot.raw && typeof snapshot.raw === "object" ? snapshot.raw as Record<string, unknown> : {}),
      _riftskin_notifications: nextNotificationState,
    }

    const saved = await upsertSubscriptionRow(adminClient, {
      stripe_subscription_id: snapshot.subscriptionId,
      stripe_customer_id: snapshot.customerId,
      customer_email: snapshot.customerEmail,
      status: snapshot.status || eventType,
      product_id: snapshot.productId,
      price_id: snapshot.priceId,
      current_period_starts_at: snapshot.currentPeriodStartsAt,
      current_period_ends_at: snapshot.currentPeriodEndsAt,
      canceled_at: snapshot.canceledAt,
      activated_at: snapshot.activatedAt,
      trialing_at: snapshot.trialingAt,
      paused_at: snapshot.pausedAt,
      activation_key_id: activationKey.id,
      last_event_id: String(payload.id || "").trim() || null,
      last_event_type: eventType,
      last_event_at: new Date().toISOString(),
      raw: rawWithNotifications,
      updated_at: new Date().toISOString(),
    })

    const userId = await findUserIdByEmail(adminClient, snapshot.customerEmail)
    if (userId) {
      await ensureRedemption(adminClient, activationKey.id, userId)
      await ensureUserAccess(adminClient, userId, activationKey.id, snapshot.currentPeriodEndsAt, active)
    }

    let emailReceipt = null
    if (eventType === "checkout.session.completed" && active) {
      emailReceipt = await sendPremiumKeyEmail({
        toEmail: snapshot.customerEmail,
        activationKeyCode: activationKey.code,
        currentPeriodEndsAt: snapshot.currentPeriodEndsAt,
      })
    }

    return json({
      ok: true,
      eventType,
      subscriptionId: snapshot.subscriptionId,
      customerEmail: snapshot.customerEmail,
      activationKeyCode: activationKey.code,
      active,
      billingRowId: saved.id,
      emailReceipt,
      statusEmail,
    })
  } catch (error) {
    return json({
      error: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
