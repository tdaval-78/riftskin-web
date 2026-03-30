import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { escapeHtml, renderEmailLayout } from "../_shared/email-template.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const bucketName = "support-requests"
const maxFiles = 5
const maxFileSize = 25 * 1024 * 1024
const attachmentLinkTtlSeconds = 60 * 60 * 24 * 7
const allowedMimePrefixes = ["image/", "video/"]
const allowedMimeTypes = [
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "application/json",
]

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

function sanitizeFileName(name: string) {
  return (name || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "file"
}

function isAllowedFile(file: File) {
  if (!file || !file.name) return false
  if (file.size <= 0 || file.size > maxFileSize) return false
  const type = (file.type || "").toLowerCase()
  if (!type) {
    return /\.(png|jpe?g|gif|webp|heic|mov|mp4|m4v|webm|zip|txt|log|json)$/i.test(file.name)
  }
  if (allowedMimePrefixes.some((prefix) => type.startsWith(prefix))) return true
  return allowedMimeTypes.includes(type)
}

async function ensureBucket(client: any) {
  const { data: buckets, error: listError } = await client.storage.listBuckets()
  if (listError) throw listError
  const exists = (buckets || []).some((bucket: any) => bucket.name === bucketName)
  if (exists) return

  const { error: createError } = await client.storage.createBucket(bucketName, {
    public: false,
    fileSizeLimit: maxFileSize,
    allowedMimeTypes: [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "image/heic",
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-m4v",
      "application/zip",
      "application/x-zip-compressed",
      "text/plain",
      "application/json",
    ],
  })

  if (createError && !/already exists/i.test(createError.message || "")) {
    throw createError
  }
}

async function sendSupportEmail(params: {
  requestId: string
  createdAt: string
  name: string
  email: string
  topicLabel: string
  message: string
  attachments: Array<Record<string, unknown>>
}) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY")
  if (!resendApiKey) {
    return { sent: false, reason: "missing_resend_api_key" }
  }

  const supportToEmail = Deno.env.get("SUPPORT_TO_EMAIL") || "support@riftskin.com"
  const supportFromEmail = Deno.env.get("SUPPORT_FROM_EMAIL") || "RIFTSKIN <no-reply@riftskin.com>"

  const attachmentItems = params.attachments.length
    ? params.attachments.map((attachment) => {
        const name = String(attachment.name || "Attachment")
        const size = String(attachment.size || "")
        const signedUrl = String(attachment.signed_url || "")
        const sizeSuffix = size ? ` (${size} bytes)` : ""
        if (!signedUrl) return `<li style="margin:0 0 8px;">${escapeHtml(name)}${escapeHtml(sizeSuffix)}</li>`
        return `<li style="margin:0 0 8px;"><a href="${escapeHtml(signedUrl)}" style="color:#e5edf8;text-decoration:none;">${escapeHtml(name)}</a>${escapeHtml(sizeSuffix)}</li>`
      }).join("")
    : "<li style=\"margin:0;\">No attachment</li>"

  const html = renderEmailLayout({
    previewText: `New RIFTSKIN support ticket: ${params.topicLabel}`,
    eyebrow: "Support",
    title: "New support ticket",
    lead: `${params.name} sent a request from the RIFTSKIN website.`,
    bodyHtml: `
      <div style="margin:0 0 18px;padding:18px 20px;background:#111c31;border:1px solid #22314d;border-radius:18px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#c6a756;margin:0 0 10px;">Ticket</div>
        <div style="margin:0 0 6px;"><strong>ID:</strong> ${escapeHtml(params.requestId)}</div>
        <div style="margin:0 0 6px;"><strong>Sent at:</strong> ${escapeHtml(params.createdAt)}</div>
        <div style="margin:0 0 6px;"><strong>Name:</strong> ${escapeHtml(params.name)}</div>
        <div style="margin:0 0 6px;"><strong>Email:</strong> ${escapeHtml(params.email)}</div>
        <div><strong>Topic:</strong> ${escapeHtml(params.topicLabel)}</div>
      </div>
      <div style="margin:0 0 18px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#c6a756;margin:0 0 10px;">Message</div>
        <div style="white-space:pre-wrap;padding:16px 18px;background:#0b1323;border:1px solid #22314d;border-radius:16px;">${escapeHtml(params.message)}</div>
      </div>
      <div>
        <div style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#c6a756;margin:0 0 10px;">Attachments</div>
        <ul style="margin:0;padding-left:18px;color:#93a4bf;">${attachmentItems}</ul>
      </div>
    `,
    footerNote: "This message was sent from the RIFTSKIN website support form.",
  })

  const textAttachments = params.attachments.length
    ? params.attachments.map((attachment) => {
        const name = String(attachment.name || "Attachment")
        const signedUrl = String(attachment.signed_url || "")
        return signedUrl ? `- ${name}: ${signedUrl}` : `- ${name}`
      }).join("\n")
    : "- No attachment"

  const text = [
    "New RIFTSKIN support request",
    `Request ID: ${params.requestId}`,
    `Sent at: ${params.createdAt}`,
    `Name: ${params.name}`,
    `Email: ${params.email}`,
    `Topic: ${params.topicLabel}`,
    "",
    params.message,
    "",
    "Attachments:",
    textAttachments,
  ].join("\n")

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: supportFromEmail,
      to: [supportToEmail],
      reply_to: params.email,
      subject: `[RIFTSKIN Support] ${params.topicLabel}`,
      html,
      text,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`resend_error:${response.status}:${errorText}`)
  }

  const payload = await response.json()
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

    const formData = await req.formData()
    const name = String(formData.get("name") || "").trim()
    const email = String(formData.get("email") || "").trim()
    const topic = String(formData.get("topic") || "").trim()
    const topicLabel = String(formData.get("topic_label") || topic).trim()
    const message = String(formData.get("message") || "").trim()

    if (!name || !email || !topic || !message) {
      return json({ error: "missing_fields" }, 400)
    }

    const attachmentEntries = formData.getAll("attachments")
    const files = attachmentEntries.filter((entry): entry is File => entry instanceof File && entry.size > 0)

    if (files.length > maxFiles) {
      return json({ error: "too_many_files" }, 400)
    }

    for (const file of files) {
      if (!isAllowedFile(file)) {
        return json({ error: "unsupported_file", file: file.name }, 400)
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await ensureBucket(supabase)

    const requestId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const attachmentMeta: Array<Record<string, unknown>> = []

    for (const [index, file] of files.entries()) {
      const fileName = sanitizeFileName(file.name)
      const filePath = `${requestId}/${String(index + 1).padStart(2, "0")}-${fileName}`
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })

      if (uploadError) {
        throw uploadError
      }

      const signedResult = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, attachmentLinkTtlSeconds)

      if (signedResult.error) {
        throw signedResult.error
      }

      attachmentMeta.push({
        name: file.name,
        mime_type: file.type || "application/octet-stream",
        size: file.size,
        path: filePath,
        signed_url: signedResult.data ? signedResult.data.signedUrl : "",
      })
    }

    const payload = {
      request_id: requestId,
      created_at: createdAt,
      name,
      email,
      topic,
      topic_label: topicLabel,
      message,
      attachment_count: attachmentMeta.length,
      attachments: attachmentMeta,
      source: "website-support-form",
      origin: req.headers.get("origin") || "",
      referer: req.headers.get("referer") || "",
      user_agent: req.headers.get("user-agent") || "",
    }

    const manifest = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    })

    const { error: manifestError } = await supabase.storage
      .from(bucketName)
      .upload(`${requestId}/request.json`, manifest, {
        contentType: "application/json",
        upsert: false,
      })

    if (manifestError) {
      throw manifestError
    }

    const emailResult = await sendSupportEmail({
      requestId,
      createdAt,
      name,
      email,
      topicLabel,
      message,
      attachments: attachmentMeta,
    })

    return json({
      ok: true,
      request_id: requestId,
      attachments_uploaded: attachmentMeta.length,
      email_sent: emailResult.sent,
    })
  } catch (error) {
    console.error("support-request error", error)
    return json({
      error: "support_request_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    }, 500)
  }
})
