import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { escapeHtml, renderEmailButton, renderEmailLayout } from "../_shared/email-template.ts"

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

function firstNonEmpty<T>(...values: Array<T | null | undefined>) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return value
  }
  return null
}

function isAccessActive(status: string, endsAt: string | null) {
  if (["active", "trialing"].includes(status)) return true
  if (["canceled", "cancelled", "past_due", "paused", "unpaid"].includes(status) && endsAt) {
    return new Date(endsAt).getTime() > Date.now()
  }
  return false
}

function isCancellationScheduled(raw: unknown) {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  return record.cancel_at_period_end === true || !!record.cancel_at
}

function getNotificationState(raw: unknown) {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  const existing = record._riftskin_notifications
  return existing && typeof existing === "object" ? existing as Record<string, unknown> : {}
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
  const normalized = normalizeEmail(email)
  let page = 1

  while (page <= 10) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    const users = Array.isArray(data?.users) ? data.users : []
    const match = users.find((user: any) => normalizeEmail(user.email) === normalized)
    if (match) return match.id
    if (users.length < 200) break
    page += 1
  }

  return null
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
  const notePrefixes = ["[stripe-subscription:", "[paddle-subscription:"]
  const canonicalNote = `${notePrefixes[0]}${params.subscriptionId}]`
  const active = !params.accessEndsAt || new Date(params.accessEndsAt).getTime() > Date.now()
  let targetKeyId = params.existingKeyId || null

  const loadByNote = async () => {
    for (const prefix of notePrefixes) {
      const existingByNote = await adminClient
        .from("activation_keys")
        .select("id, code, expires_at, is_active")
        .eq("note", `${prefix}${params.subscriptionId}]`)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingByNote.error) throw existingByNote.error
      if (existingByNote.data) return existingByNote.data
    }
    return null
  }

  if (!targetKeyId) {
    const existingByNote = await loadByNote()
    targetKeyId = existingByNote?.id || null
  }

  if (targetKeyId) {
    const { data, error } = await adminClient
      .from("activation_keys")
      .update({
        created_for_email: params.customerEmail,
        note: canonicalNote,
        expires_at: params.accessEndsAt,
        is_active: active,
      })
      .eq("id", targetKeyId)
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
      note: canonicalNote,
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

async function syncLegacyDesktopLicense(adminClient: any, params: {
  activationKeyCode: string
  accessEndsAt: string | null
  active: boolean
  subscriptionId: string
}) {
  const { data: existing, error: loadError } = await adminClient
    .from("license_keys")
    .select("id")
    .eq("license_key", params.activationKeyCode)
    .limit(1)
    .maybeSingle()

  if (loadError) throw loadError

  const payload = {
    license_key: params.activationKeyCode,
    license_type: "premium",
    source: "manual",
    is_active: params.active,
    expires_at: params.accessEndsAt,
    notes: `[stripe-subscription:${params.subscriptionId}]`,
  }

  if (existing?.id) {
    const { error } = await adminClient
      .from("license_keys")
      .update(payload)
      .eq("id", existing.id)
    if (error) throw error
    return existing.id
  }

  const { data, error } = await adminClient
    .from("license_keys")
    .insert(payload)
    .select("id")
    .single()

  if (error) throw error
  return data?.id || null
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
    || "RIFTSKIN <no-reply@riftskin.com>"
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

  const html = renderEmailLayout({
    previewText: `Your RIFTSKIN Premium license is ready: ${params.activationKeyCode}`,
    eyebrow: "Premium active",
    title: "Your RIFTSKIN Premium license",
    lead: "Your payment has been confirmed and your Premium subscription is now active.",
    bodyHtml: `
      <div style="margin:0 0 18px;padding:18px 20px;background:#111c31;border:1px solid #22314d;border-radius:18px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#c6a756;margin:0 0 8px;">Your license</div>
        <div style="font-size:28px;line-height:1.2;font-weight:800;letter-spacing:1.5px;color:#ffffff;">${escapeHtml(params.activationKeyCode)}</div>
      </div>
      <p style="margin:0 0 14px;">This same license remains valid for as long as your subscription stays active.</p>
      ${cycleEnd ? `<p style="margin:0 0 14px;">Next billing date: <strong>${escapeHtml(cycleEnd)}</strong></p>` : ""}
      <div style="margin:0 0 18px;">${renderEmailButton("Open my account", "https://riftskin.com/account.html")}</div>
    `,
    footerNote: "You can reply directly to this email if you need help.",
  })

  const text = [
    "Welcome to RIFTSKIN Premium",
    "",
    "Your payment has been confirmed.",
    `Your Premium license: ${params.activationKeyCode}`,
    cycleEnd ? `Next billing date: ${cycleEnd}` : "",
  ].filter(Boolean).join("\n")

  return sendBillingEmail({
    toEmail: params.toEmail,
    subject: "Your RIFTSKIN Premium license",
    html,
    text,
  })
}

async function sendCancellationAcknowledgedEmail(params: {
  toEmail: string
  currentPeriodEndsAt: string | null
}) {
  const cycleEnd = formatParisDate(params.currentPeriodEndsAt)
  const html = renderEmailLayout({
    previewText: cycleEnd
      ? `Cancellation confirmed. Your access stays active until ${cycleEnd}.`
      : "Cancellation confirmed. Your access stays active until the end of the paid period.",
    eyebrow: "Subscription",
    title: "Cancellation confirmed",
    lead: "Your RIFTSKIN Premium subscription will no longer renew automatically.",
    bodyHtml: `
      <p style="margin:0 0 14px;">${cycleEnd
        ? `Your Premium access stays active until <strong>${escapeHtml(cycleEnd)}</strong>.`
        : "Your Premium access stays active until the end of the period you already paid for."}</p>
      <p style="margin:0 0 14px;">No new charge will be made at the next monthly renewal.</p>
      <p style="margin:0 0 18px;">Your license stays the same during that time and remains available in your RIFTSKIN account, but Premium features will stop automatically at the end date above.</p>
      <div style="margin:0 0 18px;">${renderEmailButton("Manage subscription", "https://riftskin.com/account.html")}</div>
      <div style="padding:14px 16px;background:#0b1323;border:1px solid #22314d;border-radius:16px;color:#93a4bf;">
        VAT not applicable, article 293 B of the French CGI.
      </div>
    `,
    footerNote: "If this cancellation was not requested by you, contact RIFTSKIN support immediately.",
  })

  const text = [
    "RIFTSKIN Premium cancellation",
    "",
    "Your cancellation request has been confirmed.",
    cycleEnd ? `Your Premium access stays active until ${cycleEnd}.` : "Your Premium access stays active until the end of the paid period.",
    "No new charge will be made at the next monthly renewal.",
    "Your license stays the same during that time and remains available in your RIFTSKIN account, but Premium features will stop automatically at the end date above.",
    "VAT not applicable, article 293 B of the French CGI.",
  ].join("\n")

  return sendBillingEmail({
    toEmail: params.toEmail,
    subject: "Cancellation confirmed - RIFTSKIN Premium",
    html,
    text,
  })
}

async function sendSubscriptionExpiredEmail(params: {
  toEmail: string
}) {
  const html = renderEmailLayout({
    previewText: "Your Premium subscription has ended. Your account remains available for a future reactivation.",
    eyebrow: "Subscription",
    title: "Your Premium access has expired",
    lead: "Your RIFTSKIN Premium subscription has now ended.",
    bodyHtml: `
      <p style="margin:0 0 14px;">Your Premium license is no longer active and no longer unlocks Premium features in the desktop app.</p>
      <p style="margin:0 0 14px;">Your web account remains available, and you can subscribe again at any time to reactivate your license and Premium features.</p>
      <p style="margin:0 0 18px;">Free mode still works inside the desktop app.</p>
      <div style="margin:0 0 18px;">${renderEmailButton("Subscribe again", "https://riftskin.com/pricing.html")}</div>
      <div style="padding:14px 16px;background:#0b1323;border:1px solid #22314d;border-radius:16px;color:#93a4bf;">
        VAT not applicable, article 293 B of the French CGI.
      </div>
    `,
    footerNote: "You can always check your license and subscription status from your RIFTSKIN account.",
  })

  const text = [
    "RIFTSKIN Premium subscription ended",
    "",
    "Your Premium subscription has now ended and Premium access has expired.",
    "Your Premium license is no longer active and no longer unlocks Premium features in the desktop app.",
    "Your web account remains available, and you can subscribe again at any time to reactivate your license.",
    "VAT not applicable, article 293 B of the French CGI.",
  ].join("\n")

  return sendBillingEmail({
    toEmail: params.toEmail,
    subject: "Subscription ended - RIFTSKIN Premium",
    html,
    text,
  })
}

async function getCustomerEmail(customerId: string | null, apiKey: string) {
  if (!customerId) return null
  const customer = await stripeRequest(`/v1/customers/${customerId}`, apiKey)
  return normalizeEmail(customer.email)
}

async function listStripeCustomersByEmail(email: string, apiKey: string) {
  const payload = await stripeRequest(`/v1/customers?email=${encodeURIComponent(email)}&limit=10`, apiKey)
  return Array.isArray(payload.data) ? payload.data : []
}

async function listSubscriptionsForCustomer(customerId: string, apiKey: string) {
  const payload = await stripeRequest(`/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`, apiKey)
  return Array.isArray(payload.data) ? payload.data : []
}

function buildSubscriptionSnapshotFromSubscription(subscription: Record<string, unknown>, fallbackEmail: string) {
  const items = (((subscription.items || {}) as Record<string, unknown>).data || []) as Array<Record<string, unknown>>
  const firstItem = items[0] || {}
  const price = (firstItem.price || {}) as Record<string, unknown>
  const product = price.product
  const customerId = String(subscription.customer || "").trim() || null
  const customerEmail =
    normalizeEmail((subscription.metadata as Record<string, unknown> | undefined)?.email) ||
    normalizeEmail(fallbackEmail)

  const currentPeriodEndsAt = unixToIso(firstNonEmpty(
    subscription.current_period_end,
    firstItem.current_period_end,
  ))

  return {
    subscriptionId: String(subscription.id || "").trim(),
    customerId,
    customerEmail,
    status: String(subscription.status || "").trim().toLowerCase(),
    priceId: String(price.id || "").trim() || null,
    productId: typeof product === "string" ? product : String((product as Record<string, unknown> | null)?.id || "").trim() || null,
    currentPeriodStartsAt: unixToIso(firstNonEmpty(
      subscription.current_period_start,
      firstItem.current_period_start,
    )),
    currentPeriodEndsAt,
    canceledAt: unixToIso(subscription.canceled_at),
    activatedAt: unixToIso(subscription.start_date),
    trialingAt: unixToIso(subscription.trial_start),
    pausedAt: unixToIso(((subscription.pause_collection || {}) as Record<string, unknown>).resumes_at),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    cancelAt: unixToIso(subscription.cancel_at),
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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
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

    const customers = await listStripeCustomersByEmail(targetEmail, stripeSecretKey)
    const subscriptions = []
    for (const customer of customers) {
      const customerId = String(customer.id || "").trim()
      if (!customerId) continue
      const rows = await listSubscriptionsForCustomer(customerId, stripeSecretKey)
      for (const row of rows) subscriptions.push(row)
    }

    subscriptions.sort((a: any, b: any) => Number(b.created || 0) - Number(a.created || 0))
    const preferred = subscriptions.find((row: any) => ["active", "trialing", "past_due", "canceled", "cancelled"].includes(String(row.status || "").toLowerCase()))
    if (!preferred) {
      return json({ ok: false, reason: "no_subscription_found", email: targetEmail })
    }

    const snapshot = buildSubscriptionSnapshotFromSubscription(preferred as Record<string, unknown>, targetEmail)
    if (!snapshot.subscriptionId || !snapshot.customerEmail) {
      return json({ ok: false, reason: "missing_subscription_identity", email: targetEmail })
    }

    const userId = await findUserIdByEmail(adminClient, snapshot.customerEmail)
    const adminUserId = await getAppAdminId(adminClient)
    const keyOwnerUserId = adminUserId || userId
    if (!keyOwnerUserId) {
      return json({ error: "missing_key_owner_user" }, 500)
    }

    const existing = await adminClient
      .from("stripe_subscriptions")
      .select("id, activation_key_id, raw, status, current_period_ends_at")
      .eq("stripe_subscription_id", snapshot.subscriptionId)
      .maybeSingle()

    if (existing.error) {
      return json({ error: "load_subscription_failed", detail: existing.error.message }, 500)
    }

    const existingNotificationState = getNotificationState(existing.data?.raw)
    const existingActive = isAccessActive(String(existing.data?.status || ""), existing.data?.current_period_ends_at ? String(existing.data.current_period_ends_at) : null)
    const active = isAccessActive(snapshot.status, snapshot.currentPeriodEndsAt)
    const cancellationScheduled = isCancellationScheduled(snapshot.raw)
    const activationKey = await ensureActivationKey(adminClient, {
      adminUserId: keyOwnerUserId,
      subscriptionId: snapshot.subscriptionId,
      customerEmail: snapshot.customerEmail,
      accessEndsAt: snapshot.currentPeriodEndsAt,
      existingKeyId: existing.data?.activation_key_id || null,
    })

    let statusEmail = null
    const nextNotificationState: Record<string, unknown> = { ...existingNotificationState }

    if (
      cancellationScheduled &&
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
      existingNotificationState.expired_period_end !== snapshot.currentPeriodEndsAt
    ) {
      statusEmail = await sendSubscriptionExpiredEmail({
        toEmail: snapshot.customerEmail,
      })
      nextNotificationState.expired_period_end = snapshot.currentPeriodEndsAt
    }

    const rawWithNotifications = {
      ...(snapshot.raw && typeof snapshot.raw === "object" ? snapshot.raw as Record<string, unknown> : {}),
      _riftskin_notifications: nextNotificationState,
    }

    const saved = await upsertSubscriptionRow(adminClient, {
      stripe_subscription_id: snapshot.subscriptionId,
      stripe_customer_id: snapshot.customerId,
      customer_email: snapshot.customerEmail,
      status: snapshot.status,
      product_id: snapshot.productId,
      price_id: snapshot.priceId,
      current_period_starts_at: snapshot.currentPeriodStartsAt,
      current_period_ends_at: snapshot.currentPeriodEndsAt,
      canceled_at: snapshot.canceledAt,
      activated_at: snapshot.activatedAt,
      trialing_at: snapshot.trialingAt,
      paused_at: snapshot.pausedAt,
      activation_key_id: activationKey.id,
      last_event_id: null,
      last_event_type: "manual_reconcile",
      last_event_at: new Date().toISOString(),
      raw: rawWithNotifications,
      updated_at: new Date().toISOString(),
    })

    await syncLegacyDesktopLicense(adminClient, {
      activationKeyCode: activationKey.code,
      accessEndsAt: snapshot.currentPeriodEndsAt,
      active,
      subscriptionId: snapshot.subscriptionId,
    })

    if (userId) {
      await ensureRedemption(adminClient, activationKey.id, userId)
      await ensureUserAccess(adminClient, userId, activationKey.id, snapshot.currentPeriodEndsAt, active)
    }

    let emailReceipt = null
    if (active && (!existing.data?.id || !existingActive)) {
      emailReceipt = await sendPremiumKeyEmail({
        toEmail: snapshot.customerEmail,
        activationKeyCode: activationKey.code,
        currentPeriodEndsAt: snapshot.currentPeriodEndsAt,
      })
    }

    return json({
      ok: true,
      email: snapshot.customerEmail,
      subscriptionId: snapshot.subscriptionId,
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
