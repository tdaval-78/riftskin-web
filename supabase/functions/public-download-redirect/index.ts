import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

function normalizeText(value: unknown) {
  return String(value || "").trim()
}

function getFirstHeader(req: Request, names: string[]) {
  for (const name of names) {
    const value = normalizeText(req.headers.get(name))
    if (value) return value
  }
  return ""
}

function getClientIp(req: Request) {
  const direct = getFirstHeader(req, [
    "x-real-ip",
    "cf-connecting-ip",
    "fly-client-ip",
    "x-client-ip",
  ])
  if (direct) return direct

  const forwardedFor = getFirstHeader(req, ["x-forwarded-for"])
  if (!forwardedFor) return ""
  return normalizeText(forwardedFor.split(",")[0])
}

function getCountryCode(req: Request) {
  const code = getFirstHeader(req, [
    "x-country-code",
    "x-vercel-ip-country",
    "cf-ipcountry",
    "x-geo-country",
  ]).toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

function redirect(location: string, status = 302) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "missing_supabase_env" }, 500)
  }

  try {
    const url = new URL(req.url)
    const requestedTag = normalizeText(url.searchParams.get("tag"))
    const assetKey = normalizeText(url.searchParams.get("asset")) || "macos-installer"
    const sourcePage = normalizeText(url.searchParams.get("source")) || null
    const releaseApiUrl = requestedTag
      ? `https://api.github.com/repos/tdaval-78/riftskin-updates/releases/tags/${encodeURIComponent(requestedTag)}`
      : "https://api.github.com/repos/tdaval-78/riftskin-updates/releases/latest"

    const ghResponse = await fetch(releaseApiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "RIFTSKIN-public-download-redirect",
      },
    })
    const ghPayload = await ghResponse.json().catch(() => ({}))
    if (!ghResponse.ok) {
      return redirect("https://github.com/tdaval-78/riftskin-updates/releases/latest")
    }

    const releaseTag = normalizeText(ghPayload.tag_name)
    const releaseName = normalizeText(ghPayload.name) || releaseTag || null
    const releaseUrl = normalizeText(ghPayload.html_url) || "https://github.com/tdaval-78/riftskin-updates/releases/latest"
    const assets: Record<string, unknown>[] = Array.isArray(ghPayload.assets) ? ghPayload.assets as Record<string, unknown>[] : []

    const preferredAssetNameByKey: Record<string, string> = {
      "macos-installer": "RiftSkin-macos-installer.pkg",
      "windows-installer": "RiftSkin-Windows.exe",
      "direct-app": "RiftSkin-macos-installer.pkg",
    }
    const preferredAssetName = preferredAssetNameByKey[assetKey] || assetKey
    const selectedAsset = assets.find((asset: Record<string, unknown>) => normalizeText(asset?.name) === preferredAssetName)
      || assets.find((asset: Record<string, unknown>) => normalizeText(asset?.browser_download_url))
      || null

    const assetName = normalizeText(selectedAsset?.name) || preferredAssetName || "release-asset"
    const assetDownloadUrl = normalizeText(selectedAsset?.browser_download_url) || releaseUrl

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const ipAddress = getClientIp(req) || null
    const forwardedFor = getFirstHeader(req, ["x-forwarded-for"]) || null
    const countryCode = getCountryCode(req)
    const userAgent = normalizeText(req.headers.get("user-agent")) || null

    await serviceClient.from("release_download_events").insert({
      release_tag: releaseTag || requestedTag || "latest",
      release_name: releaseName,
      asset_name: assetName,
      asset_download_url: assetDownloadUrl,
      source_page: sourcePage,
      country_code: countryCode,
      ip_address: ipAddress,
      forwarded_for: forwardedFor,
      user_agent: userAgent,
    })

    return redirect(assetDownloadUrl)
  } catch (_error) {
    return redirect("https://github.com/tdaval-78/riftskin-updates/releases/latest")
  }
})
