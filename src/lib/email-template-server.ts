/**
 * Plantilla de email multi-náutica para uso en servidor (API, Cloud Functions).
 * Sin dependencias de Firestore cliente.
 */

const BRAND_NAVY = "#1a4a73";
const BODY_BG = "#f5f5f5";
const CARD_BG = "#ffffff";
const TEXT_COLOR = "#1a1a1a";
const MUTED_COLOR = "#6b7280";
const HEADER_BG = "#0f2a42";
const DEFAULT_BRAND = "NauticAdmin";

export type EmailBrandOptions = {
  title?: string;
  greeting?: string;
  /** Nombre de la náutica (cabecera y pie). */
  brandName?: string;
  /** URL pública del logo de la náutica (opcional). */
  logoUrl?: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Iniciales para el badge cuando no hay logo (ej. "Marinas del Yaguarón" → "MY"). */
export function brandInitials(name: string): string {
  const stop = new Set(["de", "del", "la", "las", "los", "el", "y", "the", "of", "e"]);
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !stop.has(w.toLowerCase()));
  if (words.length === 0) return "NA";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Genera HTML de correo con cabecera de la náutica (o NauticAdmin por defecto).
 */
export function buildEmailHtmlServer(
  contentHtml: string,
  options?: EmailBrandOptions
): string {
  const brandName = (options?.brandName?.trim() || DEFAULT_BRAND);
  const title = options?.title ?? brandName;
  const greeting = options?.greeting ?? "";
  const logoUrl = options?.logoUrl?.trim();
  const initials = brandInitials(brandName);

  const logoCell = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" width="40" height="40" style="display:block;width:40px;height:40px;object-fit:contain;border-radius:8px;" />`
    : `<div style="width:40px;height:40px;background-color:${BRAND_NAVY};border-radius:8px;text-align:center;line-height:40px;color:#ffffff;font-weight:800;font-size:14px;letter-spacing:0.02em;">${escapeHtml(initials)}</div>`;

  const headerContent = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
        <tr>
          <td style="padding-right:12px;vertical-align:middle;">
            ${logoCell}
          </td>
          <td style="vertical-align:middle;text-align:left;">
            <span style="color:#ffffff;font-weight:800;font-size:20px;letter-spacing:0.02em;line-height:1.2;">${escapeHtml(brandName)}</span>
          </td>
        </tr>
      </table>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BODY_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.6;color:${TEXT_COLOR};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BODY_BG};padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
          <tr>
            <td style="background-color:${HEADER_BG};color:#fff;padding:20px 24px;text-align:center;font-weight:800;font-size:20px;letter-spacing:0.04em;">
              ${headerContent}
            </td>
          </tr>
          <tr>
            <td style="background-color:${CARD_BG};padding:28px 24px;border:1px solid #e5e7eb;">
              ${greeting ? `<p style="margin:0 0 16px 0;color:${MUTED_COLOR};font-size:15px;">${escapeHtml(greeting)}</p>` : ""}
              <div style="margin:0;color:${TEXT_COLOR};">
                ${contentHtml}
              </div>
              <p style="margin:24px 0 0 0;padding-top:16px;border-top:1px solid #eee;font-size:13px;color:${MUTED_COLOR};">
                Este correo fue enviado por ${escapeHtml(brandName)}. No responder a este mensaje.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
