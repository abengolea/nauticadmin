/**
 * Utilidades para normalizar teléfonos al formato wa_id de WhatsApp Cloud API.
 * NotificasHub usa user_memberships con docId = phone (wa_id).
 */

/**
 * Convierte un teléfono al formato wa_id de WhatsApp (solo dígitos, con código de país).
 * Ej: "011 1234-5678" o "+54 9 11 1234-5678" → "5491112345678"
 */
export function toWaId(phone: string, defaultCountryCode = '54'): string {
  const digits = (phone ?? '').trim().replace(/\D/g, '');
  if (!digits) return '';

  // Ya tiene código de país (Argentina: 54 + 9 dígitos)
  if (digits.length >= 11 && digits.startsWith('54')) return digits;
  if (digits.length >= 12) return digits;

  // Argentina: 10 dígitos empezando con 9 (cel) → agregar 54
  if (digits.length === 10 && digits.startsWith('9')) {
    return defaultCountryCode + digits;
  }

  // Argentina: 11 dígitos con 15 (código área CABA) → agregar 54
  if (digits.length === 11 && digits.startsWith('15')) {
    return defaultCountryCode + '9' + digits.slice(1);
  }

  // Por defecto: agregar código de país si son 9-10 dígitos
  if (digits.length >= 9 && digits.length <= 10) {
    return defaultCountryCode + (digits.startsWith('9') ? digits : '9' + digits);
  }

  return digits;
}
