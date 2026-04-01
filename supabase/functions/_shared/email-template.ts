const brand = {
  appName: "RIFTSKIN",
  logoUrl: "https://riftskin.com/assets/logo.png",
  siteUrl: "https://riftskin.com",
  accountUrl: "https://riftskin.com/account.html",
  supportUrl: "https://riftskin.com/support.html",
  background: "#06070a",
  text: "#f6f8fc",
  textSoft: "#c8d0dd",
  muted: "#7c8798",
  accent: "#d3b04b",
  accentSoft: "#f1dd91",
  accentText: "#fffdf5",
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.08)",
  success: "#63e6be",
  danger: "#ff8b7d",
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function getAutomatedFromEmail() {
  return Deno.env.get("NO_REPLY_FROM_EMAIL") || "RIFTSKIN <no-reply@riftskin.com>"
}

export function getSupportReplyToEmail() {
  return Deno.env.get("SUPPORT_TO_EMAIL") || "support@riftskin.com"
}

export function renderEmailButton(label: string, href: string) {
  return `
    <a
      href="${escapeHtml(href)}"
      style="
        display:inline-block;
        min-width:220px;
        padding:15px 24px;
        border-radius:999px;
        border:1px solid rgba(211,176,75,0.55);
        background:linear-gradient(180deg, #d3b04b, #8f7130);
        color:${brand.accentText};
        font-weight:800;
        font-size:16px;
        letter-spacing:0.01em;
        text-decoration:none;
        text-align:center;
        box-shadow:0 12px 30px rgba(211,176,75,0.18);
      "
    >
      ${escapeHtml(label)}
    </a>
  `.trim()
}

export function renderEmailLayout(params: {
  previewText?: string
  eyebrow?: string
  title: string
  lead?: string
  bodyHtml: string
  footerNote?: string
  badge?: string
}) {
  const previewText = params.previewText ? escapeHtml(params.previewText) : ""
  const eyebrow = params.eyebrow
    ? `
      <div style="font-size:13px;line-height:1;color:#e8dbb0;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;text-align:center;">
        ${escapeHtml(params.eyebrow)}
      </div>
    `.trim()
    : ""
  const badgeLabel = params.badge || params.eyebrow || ""
  const badge = badgeLabel
    ? `
      <div style="display:inline-block;padding:8px 14px;border:1px solid rgba(211,176,75,0.28);border-radius:999px;background:rgba(211,176,75,0.10);color:${brand.accentSoft};font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
        ${escapeHtml(badgeLabel)}
      </div>
    `.trim()
    : ""
  const lead = params.lead ? `<p style="margin:0;font-size:17px;line-height:1.65;color:#a6b0bf;">${escapeHtml(params.lead)}</p>` : ""
  const footerNote = params.footerNote
    ? `<p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:${brand.muted};">${escapeHtml(params.footerNote)}</p>`
    : ""

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(params.title)}</title>
      </head>
      <body style="margin:0;padding:0;background:${brand.background};font-family:'Avenir Next','SF Pro Text',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${brand.text};">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
          ${previewText}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="
          background:
            linear-gradient(180deg, rgba(0,0,0,0.30), rgba(0,0,0,0.48)),
            radial-gradient(circle at 18% 8%, rgba(211,176,75,0.10), transparent 22%),
            radial-gradient(circle at 84% 14%, rgba(131,140,154,0.08), transparent 20%),
            linear-gradient(180deg, #090c11 0%, #0b0f15 24%, #0c1118 62%, #090c12 100%);
          padding:32px 14px;
        ">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;">
                <tr>
                  <td style="padding:0 0 16px 0;text-align:center;">
                    <img src="${brand.logoUrl}" alt="${brand.appName}" width="164" height="164" style="display:block;margin:0 auto 16px auto;border:0;outline:none;text-decoration:none;" />
                    ${eyebrow}
                  </td>
                </tr>
                <tr>
                  <td style="
                    border:1px solid ${brand.border};
                    border-radius:28px;
                    background:
                      linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02)),
                      linear-gradient(135deg, rgba(18,23,32,0.96), rgba(10,13,19,0.94));
                    box-shadow:0 28px 80px rgba(0,0,0,0.4);
                    overflow:hidden;
                  ">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:34px 34px 10px 34px;">
                          ${badge}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 34px 0 34px;">
                          <h1 style="margin:0;font-size:38px;line-height:1.05;font-weight:800;color:${brand.text};">
                            ${escapeHtml(params.title)}
                          </h1>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:16px 34px 0 34px;">
                          ${lead}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:26px 34px 0 34px;">
                          <div style="font-size:15px;line-height:1.75;color:${brand.text};">
                            ${params.bodyHtml}
                          </div>
                          ${footerNote}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:28px 34px 34px 34px;">
                          <div style="height:1px;background:${brand.borderSoft};margin-bottom:18px;"></div>
                          <div style="font-size:13px;line-height:1.7;color:${brand.muted};">
                            ${brand.appName}<br />
                            macOS workflow for custom League of Legends skins<br />
                            <a href="${brand.accountUrl}" style="color:${brand.textSoft};text-decoration:none;">Open account</a>
                            &nbsp;|&nbsp;
                            <a href="${brand.supportUrl}" style="color:${brand.textSoft};text-decoration:none;">Get support</a>
                            &nbsp;|&nbsp;
                            <a href="${brand.siteUrl}" style="color:${brand.textSoft};text-decoration:none;">riftskin.com</a>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `.trim()
}
