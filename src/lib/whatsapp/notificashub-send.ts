/**
 * Cliente para enviar mensajes WhatsApp vía NotificasHub.
 * NotificasHub expone POST /api/whatsapp/send para que los tenants respondan al usuario.
 *
 * Requiere: NOTIFICASHUB_URL, INTERNAL_SECRET
 */

const NOTIFICASHUB_URL = process.env.NOTIFICASHUB_URL?.trim();
const INTERNAL_SECRET = process.env.INTERNAL_SECRET?.trim();

export interface SendWhatsAppParams {
  /** Teléfono destino (E.164, ej: 5493364645357) */
  to: string;
  /** Texto del mensaje */
  text: string;
  /** Tenant ID en NotificasHub (ej: schoolId WZAf1Mw08Uq047wneIxI) para identificar el número de origen */
  tenantId?: string;
}

/**
 * Envía un mensaje de WhatsApp al usuario a través de NotificasHub.
 * Retorna true si se envió correctamente, false si faltan config o falló.
 */
export async function sendWhatsAppViaNotificasHub(params: SendWhatsAppParams): Promise<boolean> {
  if (!NOTIFICASHUB_URL || !INTERNAL_SECRET) {
    console.warn('[notificashub-send] Faltan NOTIFICASHUB_URL o INTERNAL_SECRET');
    return false;
  }

  const url = `${NOTIFICASHUB_URL.replace(/\/$/, '')}/api/whatsapp/send`;
  const digits = params.to.replace(/\D/g, '');
  const toE164 = digits.startsWith('54') && digits.length >= 12 ? digits : `54${digits.replace(/^0/, '')}`;
  const body: Record<string, string> = {
    to: toE164,
    text: params.text,
  };
  if (params.tenantId) body.tenantId = params.tenantId;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': INTERNAL_SECRET,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[notificashub-send] Error', res.status, errText);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[notificashub-send]', err);
    return false;
  }
}
