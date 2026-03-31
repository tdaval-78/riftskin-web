import "jsr:@supabase/functions-js/edge-runtime.d.ts"
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

function normalizeKey(value: unknown) {
  return String(value || "").trim().toUpperCase()
}

function normalizeDeviceId(value: unknown) {
  return String(value || "").trim()
}

async function loadLicenseByCode(adminClient: any, code: string) {
  const { data, error } = await adminClient
    .from("license_keys")
    .select("id, license_key")
    .eq("license_key", code)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function loadActivationKeyByCode(adminClient: any, code: string) {
  const { data, error } = await adminClient
    .from("activation_keys")
    .select("code, note, is_active, expires_at")
    .eq("code", code)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function ensureLegacyLicenseFromActivation(adminClient: any, activationKey: {
  code: string
  note?: string | null
  is_active?: boolean | null
  expires_at?: string | null
}) {
  const existing = await loadLicenseByCode(adminClient, activationKey.code)
  const payload = {
    license_key: activationKey.code,
    license_type: "premium",
    source: "manual",
    is_active: activationKey.is_active !== false,
    expires_at: activationKey.expires_at || null,
    notes: String(activationKey.note || "").trim(),
  }

  if (existing?.id) return existing

  const { data, error } = await adminClient
    .from("license_keys")
    .insert(payload)
    .select("id, license_key")
    .single()

  if (error) throw error
  return data
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
    const deviceId = normalizeDeviceId(body.p_device_id ?? body.deviceId)
    const licenseKey = normalizeKey(body.p_license_key ?? body.licenseKey)

    if (!deviceId) return json({ ok: false, message: "Missing device id" }, 400)
    if (!licenseKey) return json({ ok: false, message: "Missing license key" }, 400)

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    let license = await loadLicenseByCode(adminClient, licenseKey)
    if (!license) {
      const activationKey = await loadActivationKeyByCode(adminClient, licenseKey)
      if (!activationKey) {
        return json({ ok: true, released: false, message: "No machine activation was found for this license." })
      }
      license = await ensureLegacyLicenseFromActivation(adminClient, activationKey)
    }

    const { error } = await adminClient
      .from("device_activations")
      .delete()
      .eq("device_id", deviceId)
      .eq("license_key_id", license.id)

    if (error) throw error

    return json({
      ok: true,
      released: true,
      message: "This machine activation has been removed.",
    })
  } catch (error) {
    return json({
      error: "desktop_release_license_failed",
      message: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
