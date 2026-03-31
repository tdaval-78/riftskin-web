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
    `,
    footerNote: "You can always check your license and subscription status from your RIFTSKIN account.",
  })

  const text = [
    "RIFTSKIN Premium subscription ended",
    "",
    "Your Premium subscription has now ended and Premium access has expired.",
    "Your Premium license is no longer active and no longer unlocks Premium features in the desktop app.",
    "Your web account remains available, and you can subscribe again at any time to reactivate your license.",
  ].join("\n")

  return sendBillingEmail({
    toEmail: params.toEmail,
    subject: "Subscription ended - RIFTSKIN Premium",
    html,
    text,
  })
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

    let machineActivationCount = 0
    let machineActivationActive = false

    if (data.activation_key_id) {
      const activationKeyResult = await adminClient
        .from("activation_keys")
        .select("code")
        .eq("id", data.activation_key_id)
        .limit(1)
        .maybeSingle()

      if (activationKeyResult.error) {
        return json({ error: "load_activation_key_failed", detail: activationKeyResult.error.message }, 500)
      }

      const activationCode = String(activationKeyResult.data?.code || "").trim()
      if (activationCode) {
        const licenseKeyResult = await adminClient
          .from("license_keys")
          .select("id")
          .eq("license_key", activationCode)
          .limit(1)
          .maybeSingle()

        if (licenseKeyResult.error) {
          return json({ error: "load_license_key_failed", detail: licenseKeyResult.error.message }, 500)
        }

        if (licenseKeyResult.data?.id) {
          const deviceActivationResult = await adminClient
            .from("device_activations")
            .select("device_id", { count: "exact", head: false })
            .eq("license_key_id", licenseKeyResult.data.id)

          if (deviceActivationResult.error) {
            return json({ error: "load_device_activations_failed", detail: deviceActivationResult.error.message }, 500)
          }

          machineActivationCount = Number(deviceActivationResult.count || 0)
          machineActivationActive = machineActivationCount > 0
        }
      }
    }

    const status = String(data.status || "").trim().toLowerCase()
    const currentPeriodEndsAt = data.current_period_ends_at ? String(data.current_period_ends_at) : null
    const cancellationScheduled = isCancellationScheduled(data.raw)
    const active = isAccessActive(status, currentPeriodEndsAt)
    const raw = data.raw && typeof data.raw === "object" ? data.raw as Record<string, unknown> : {}
    const notificationState = getNotificationState(raw)
    let notificationEmail = null
    const nextNotificationState: Record<string, unknown> = { ...notificationState }

    if (cancellationScheduled && active && notificationState.cancellation_period_end !== currentPeriodEndsAt) {
      notificationEmail = await sendCancellationAcknowledgedEmail({
        toEmail: targetEmail,
        currentPeriodEndsAt,
      })
      nextNotificationState.cancellation_period_end = currentPeriodEndsAt
    } else if (!active && notificationState.expired_period_end !== currentPeriodEndsAt) {
      notificationEmail = await sendSubscriptionExpiredEmail({
        toEmail: targetEmail,
      })
      nextNotificationState.expired_period_end = currentPeriodEndsAt
    }

    if (JSON.stringify(nextNotificationState) !== JSON.stringify(notificationState)) {
      const nextRaw = {
        ...raw,
        _riftskin_notifications: nextNotificationState,
      }
      const { error: updateError } = await adminClient
        .from("stripe_subscriptions")
        .update({
          raw: nextRaw,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)

      if (updateError) {
        return json({ error: "update_subscription_failed", detail: updateError.message }, 500)
      }
    }

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
        machineActivationCount,
        machineActivationActive,
        updatedAt: data.updated_at,
        notifications: nextNotificationState,
      },
      notificationEmail,
    })
  } catch (error) {
    return json({
      error: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
