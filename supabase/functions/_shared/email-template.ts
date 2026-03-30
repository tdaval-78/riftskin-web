const brand = {
  appName: "RIFTSKIN",
  logoUrl: "https://riftskin.com/assets/logo.png",
  siteUrl: "https://riftskin.com",
  accountUrl: "https://riftskin.com/account.html",
  supportUrl: "https://riftskin.com/support.html",
  background: "#070b14",
  panel: "#0f172a",
  panelSoft: "#111c31",
  text: "#e5edf8",
  muted: "#93a4bf",
  accent: "#c6a756",
  accentText: "#1a1410",
  border: "#22314d",
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

export function renderEmailButton(label: string, href: string) {
  return `
    <a
      href="${escapeHtml(href)}"
      style="
        display:inline-block;
        padding:14px 22px;
        border-radius:14px;
        background:${brand.accent};
        color:${brand.accentText};
        font-weight:700;
        font-size:15px;
        text-decoration:none;
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
}) {
  const previewText = params.previewText ? escapeHtml(params.previewText) : ""
  const eyebrow = params.eyebrow ? `<div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${brand.accent};margin:0 0 12px;">${escapeHtml(params.eyebrow)}</div>` : ""
  const lead = params.lead ? `<p style="margin:0 0 18px;font-size:17px;line-height:1.7;color:${brand.text};">${escapeHtml(params.lead)}</p>` : ""
  const footerNote = params.footerNote
    ? `<div style="margin-top:16px;font-size:12px;line-height:1.7;color:${brand.muted};">${escapeHtml(params.footerNote)}</div>`
    : ""

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(params.title)}</title>
      </head>
      <body style="margin:0;padding:0;background:${brand.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${brand.text};">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
          ${previewText}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.background};padding:32px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-collapse:separate;">
                <tr>
                  <td style="padding:0 0 16px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.panel};border:1px solid ${brand.border};border-radius:24px 24px 0 0;">
                      <tr>
                        <td style="padding:26px 28px;">
                          <img src="${brand.logoUrl}" alt="${brand.appName}" width="220" style="display:block;width:220px;max-width:100%;height:auto;" />
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.panel};border:1px solid ${brand.border};border-top:none;border-radius:0 0 24px 24px;overflow:hidden;">
                      <tr>
                        <td style="padding:32px 28px 24px;">
                          ${eyebrow}
                          <h1 style="margin:0 0 14px;font-size:32px;line-height:1.15;color:#ffffff;font-weight:800;">${escapeHtml(params.title)}</h1>
                          ${lead}
                          <div style="font-size:15px;line-height:1.75;color:${brand.text};">
                            ${params.bodyHtml}
                          </div>
                          ${footerNote}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 28px 24px;">
                          <div style="height:1px;background:${brand.border};"></div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 28px 28px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.panelSoft};border:1px solid ${brand.border};border-radius:18px;">
                            <tr>
                              <td style="padding:18px 18px 16px;">
                                <div style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${brand.accent};margin:0 0 10px;">RIFTSKIN</div>
                                <div style="font-size:14px;line-height:1.7;color:${brand.muted};">
                                  Support: <a href="${brand.supportUrl}" style="color:${brand.text};text-decoration:none;">riftskin.com/support</a><br />
                                  Compte: <a href="${brand.accountUrl}" style="color:${brand.text};text-decoration:none;">riftskin.com/account</a><br />
                                  Site: <a href="${brand.siteUrl}" style="color:${brand.text};text-decoration:none;">riftskin.com</a>
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
            </td>
          </tr>
        </table>
      </body>
    </html>
  `.trim()
}
