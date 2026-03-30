import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { renderEmailButton, renderEmailLayout } from "../_shared/email-template.ts"

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

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function normalizeRedirectTo(value: unknown) {
  const fallback = "https://riftskin.com/auth/callback"
  const raw = String(value || "").trim()
  if (!raw) return fallback
  try {
    const url = new URL(raw)
    if (url.origin !== "https://riftskin.com") return fallback
    if (url.pathname !== "/auth/callback") return fallback
    return url.toString()
  } catch (_error) {
    return fallback
  }
}

async function sendAuthEmail(params: {
  toEmail: string
  subject: string
  html: string
  text: string
}) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY")
  if (!resendApiKey) {
    return { sent: false, reason: "missing_resend_api_key" }
  }

  const fromEmail = Deno.env.get("SUPPORT_FROM_EMAIL")
    || Deno.env.get("BILLING_FROM_EMAIL")
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
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "missing_supabase_env" }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const email = normalizeEmail(body.email)
    const redirectTo = normalizeRedirectTo(body.redirectTo)

    if (!email || !email.includes("@")) {
      return json({ error: "invalid_email" }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data, error } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo,
      },
    })

    if (error) {
      return json({ ok: true, sent: true })
    }

    const actionLink = data?.properties?.action_link || ""
    if (!actionLink) {
      return json({ ok: true, sent: true })
    }

    const subject = "Reset your RIFTSKIN password"
    const html = renderEmailLayout({
      previewText: "Reset your RIFTSKIN password securely.",
      eyebrow: "Account security",
      title: "Reset your password",
      lead: "A password reset was requested for your RIFTSKIN account.",
      bodyHtml: `
        <p style="margin:0 0 14px;">Use the button below to choose a new password.</p>
        <div style="margin:0 0 18px;">${renderEmailButton("Reset password", actionLink)}</div>
        <div style="margin:0 0 18px;padding:16px 18px;background:#0b1323;border:1px solid #22314d;border-radius:16px;color:#93a4bf;">
          If you did not request this reset, you can ignore this email and your current password will remain unchanged.
        </div>
      `,
      footerNote: "This reset link will return to the RIFTSKIN auth callback flow.",
    })

    const text = [
      "Reset your RIFTSKIN password",
      "",
      "Use the link below to choose a new password:",
      actionLink,
      "",
      "If you did not request this reset, you can ignore this email.",
    ].join("\n")

    const mailResult = await sendAuthEmail({
      toEmail: email,
      subject,
      html,
      text,
    })

    return json({ ok: true, sent: mailResult.sent })
  } catch (error) {
    console.error("auth-password-reset error", error)
    return json({
      error: "auth_password_reset_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    }, 500)
  }
})
