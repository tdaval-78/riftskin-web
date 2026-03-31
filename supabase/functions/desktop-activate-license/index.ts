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

function normalizeTimezone(value: unknown) {
  const raw = String(value || "").trim()
  return raw || "Europe/Paris"
}

function isFutureDate(value: string | null) {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && timestamp > Date.now()
}

async function loadLicenseByCode(adminClient: any, code: string) {
  const { data, error } = await adminClient
    .from("license_keys")
    .select("id, license_key, license_type, is_active, expires_at")
    .eq("license_key", code)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function loadActivationKeyByCode(adminClient: any, code: string) {
  const { data, error } = await adminClient
    .from("activation_keys")
    .select("id, code, note, is_active, expires_at")
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

  if (existing?.id) {
    const { data, error } = await adminClient
      .from("license_keys")
      .update(payload)
      .eq("id", existing.id)
      .select("id, license_key, license_type, is_active, expires_at")
      .single()

    if (error) throw error
    return data
  }

  const { data, error } = await adminClient
    .from("license_keys")
    .insert(payload)
    .select("id, license_key, license_type, is_active, expires_at")
    .single()

  if (error) throw error
  return data
}

async function bindDeviceLicense(adminClient: any, deviceId: string, licenseKeyId: string) {
  const { error } = await adminClient
    .from("device_activations")
    .upsert({
      device_id: deviceId,
      license_key_id: licenseKeyId,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "device_id" })

  if (error) throw error
}

async function loadDeviceActivationsForLicense(adminClient: any, licenseKeyId: string) {
  const { data, error } = await adminClient
    .from("device_activations")
    .select("device_id, license_key_id, last_seen_at")
    .eq("license_key_id", licenseKeyId)

  if (error) throw error
  return Array.isArray(data) ? data : []
}

function buildPremiumState(license: {
  license_type: string
  expires_at?: string | null
}) {
  const isAdmin = String(license.license_type || "").trim().toLowerCase() === "admin"
  return {
    access_mode: isAdmin ? "admin" : "premium",
    subscription_active: !isAdmin,
    expires_at: isAdmin ? null : (license.expires_at || null),
    daily_injection_limit: null,
    daily_injection_used: null,
    daily_injection_remaining: null,
    daily_injection_resets_at: null,
    ads_enabled: false,
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
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "missing_supabase_env" }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const deviceId = normalizeDeviceId(body.p_device_id ?? body.deviceId)
    const licenseKey = normalizeKey(body.p_license_key ?? body.licenseKey)
    normalizeTimezone(body.p_timezone ?? body.timezone)

    if (!deviceId) return json({ ok: false, message: "Missing device id" }, 400)
    if (!licenseKey) return json({ ok: false, message: "Missing license key" }, 400)

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    let license = await loadLicenseByCode(adminClient, licenseKey)
    if (!license) {
      const activationKey = await loadActivationKeyByCode(adminClient, licenseKey)
      if (!activationKey || activationKey.is_active === false || !isFutureDate(activationKey.expires_at || null)) {
        return json({ ok: false, message: "Invalid or expired license key" }, 200)
      }
      license = await ensureLegacyLicenseFromActivation(adminClient, activationKey)
    }

    const licenseType = String(license.license_type || "").trim().toLowerCase()
    const isAdmin = licenseType === "admin"
    const isPremium = licenseType === "premium"
    const valid = license.is_active === true && (isAdmin || (isPremium && isFutureDate(license.expires_at || null)))
    if (!valid) {
      return json({ ok: false, message: "Invalid or expired license key" }, 200)
    }

    const activations = await loadDeviceActivationsForLicense(adminClient, license.id)
    const currentActivation = activations.find((row: any) => normalizeDeviceId(row.device_id) === deviceId)
    const foreignActivation = activations.find((row: any) => normalizeDeviceId(row.device_id) && normalizeDeviceId(row.device_id) !== deviceId)

    if (!currentActivation && foreignActivation) {
      return json({
        ok: false,
        reason: "license_already_active_elsewhere",
        message: "This license is already active on another machine. Remove it from the active machine before using it here.",
      }, 200)
    }

    await bindDeviceLicense(adminClient, deviceId, license.id)

    return json({
      ok: true,
      state: buildPremiumState(license),
    })
  } catch (error) {
    return json({
      error: "desktop_activate_license_failed",
      message: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
