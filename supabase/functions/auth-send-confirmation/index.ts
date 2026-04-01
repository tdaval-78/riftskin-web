import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { getAutomatedFromEmail, getSupportReplyToEmail, renderEmailButton, renderEmailLayout } from "../_shared/email-template.ts"

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

async function findUserByEmail(adminClient: any, email: string) {
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
    if (match) return match
    if (users.length < 200) break
    page += 1
  }

  return null
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

  const fromEmail = getAutomatedFromEmail()
  const replyToEmail = getSupportReplyToEmail()

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

    const existingUser = await findUserByEmail(adminClient, email)
    if (!existingUser) {
      return json({ ok: true, sent: true })
    }
    if (existingUser.email_confirmed_at) {
      return json({ ok: true, sent: false, reason: "already_confirmed" })
    }

    const { data, error } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo,
      },
    })

    if (error) {
      return json({ error: "generate_link_failed", message: error.message }, 400)
    }

    const actionLink = data?.properties?.action_link || ""
    if (!actionLink) {
      return json({ error: "missing_action_link" }, 500)
    }

    const subject = "Your RIFTSKIN confirmation link"
    const html = renderEmailLayout({
      previewText: "A fresh confirmation link for your RIFTSKIN account is ready.",
      eyebrow: "Account security",
      badge: "Email confirmation",
      title: "Your confirmation link",
      lead: "Use this link to confirm your email and continue signing in to RIFTSKIN.",
      bodyHtml: `
        <p style="margin:0 0 14px;">Click the button below to confirm your email address and return to your account.</p>
        <div style="margin:0 0 18px;">${renderEmailButton("Confirm my account", actionLink)}</div>
        <p style="margin:0;">If you did not request this email, you can safely ignore it.</p>
      `,
      footerNote: "This email was requested from the RIFTSKIN account page.",
    })
    const text = [
      "Your RIFTSKIN confirmation link",
      "",
      "Use the link below to confirm your email and continue signing in:",
      actionLink,
    ].join("\n")

    const mailResult = await sendAuthEmail({
      toEmail: email,
      subject,
      html,
      text,
    })

    return json({ ok: true, sent: mailResult.sent })
  } catch (error) {
    console.error("auth-send-confirmation error", error)
    return json({
      error: "auth_send_confirmation_failed",
      message: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
