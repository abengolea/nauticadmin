/**
 * POST /api/whatsapp/incoming
 *
 * Webhook que recibe mensajes reenviados desde NotificasHub cuando el usuario
 * elige Marina del Yaguarón / Náutica.
 *
 * Flujo estructurado:
 * 1. Identifica al cliente en la base de la náutica por teléfono
 * 2. Pregunta si quiere cargar pago manual
 * 3. Si dice sí → pide imagen o PDF del comprobante
 * 4. Si envía imagen/documento → sube a Storage, aplica IA, crea pago pending_verification
 *
 * Payload (NotificasHub):
 * - Texto: { message: { type: "text", text: { body } }, from, contactName, tenantId }
 * - Imagen: { type: "image", imageBase64 | mediaUrl, from, contactName, tenantId }
 * - Documento: { type: "document", documentBase64 | mediaUrl, from, contactName, tenantId }
 *
 * Valida x-internal-token === INTERNAL_SECRET.
 * Responde al usuario vía NotificasHub POST /api/whatsapp/send.
 * Ver: docs/WHATSAPP-NOTIFICASHUB-INTEGRACION.md
 */

import { NextResponse } from 'next/server';
import { sendWhatsAppViaNotificasHub } from '@/lib/whatsapp/notificashub-send';
import { findClientsByPhone } from '@/lib/whatsapp/find-client-by-phone';
import { processWhatsAppReceipt } from '@/lib/whatsapp/process-receipt';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET?.trim();

function extractPayload(body: Record<string, unknown>): {
  from: string;
  contactName: string;
  text: string;
  messageId: string;
  type: string;
  tenantId?: string;
  imageBase64?: string;
  mediaUrl?: string;
  documentBase64?: string;
  documentMimeType?: string;
  documentFilename?: string;
} {
  const msg = body.message as Record<string, unknown> | undefined;
  const tenantId = (body.tenantId as string) ?? (body.tenant_id as string) ?? undefined;
  const from =
    (body.from as string) ??
    (msg?.from as string) ??
    (body.phone as string) ??
    (body.wa_id as string) ??
    '';
  const contactName = (body.contactName as string) ?? (body.contact_name as string) ?? 'Usuario';
  const msgText = msg?.text as Record<string, string> | undefined;
  const text =
    (msgText?.body as string) ??
    (body.text as string) ??
    (body.message_text as string) ??
    '';
  const messageId =
    (body.messageId as string) ?? (body.message_id as string) ?? (msg?.id as string) ?? '';
  const type = (body.type as string) ?? (msg?.type as string) ?? 'text';

  const msgImage = msg?.image as Record<string, string> | undefined;
  const msgDocument = msg?.document as Record<string, string> | undefined;
  const imageBase64 =
    (body.imageBase64 as string) ??
    msgImage?.base64 ??
    msgImage?.data ??
    undefined;
  const mediaUrl =
    (body.mediaUrl as string) ??
    msgImage?.url ??
    msgImage?.link ??
    msgDocument?.url ??
    msgDocument?.link ??
    undefined;
  const documentBase64 =
    (body.documentBase64 as string) ??
    msgDocument?.base64 ??
    msgDocument?.data ??
    undefined;
  const documentMimeType = (body.documentMimeType as string) ?? msgDocument?.mimeType ?? undefined;
  const documentFilename = (body.documentFilename as string) ?? msgDocument?.filename ?? undefined;

  return {
    from,
    contactName,
    text,
    messageId,
    type,
    tenantId,
    imageBase64,
    mediaUrl,
    documentBase64,
    documentMimeType,
    documentFilename,
  };
}

/** Indica si el usuario respondió afirmativamente a cargar pago */
function isAffirmativePaymentIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(s[ií]|si|yes|dale|quiero|cargar|enviar|envi[oó]|ok|okey)$/.test(t) || /s[ií]\s*$/.test(t);
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get('x-internal-token') ?? request.headers.get('x-internal-secret');
    if (!INTERNAL_SECRET || token !== INTERNAL_SECRET) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const {
      from,
      contactName,
      text,
      messageId,
      type,
      tenantId,
      imageBase64,
      mediaUrl,
      documentBase64,
      documentMimeType,
      documentFilename,
    } = extractPayload(body);

    if (!from) {
      return NextResponse.json({ error: 'from requerido' }, { status: 400 });
    }

    const schoolId = tenantId?.trim() || '';

    console.log('[whatsapp/incoming]', {
      from,
      contactName,
      type,
      messageId,
      schoolId: schoolId || '(sin tenant)',
      text: text.slice(0, 50),
      hasImage: !!(imageBase64 || mediaUrl),
      hasDocument: !!(documentBase64 || (type === 'document' && mediaUrl)),
      hasReceiptMedia,
    });

    let responseText: string;

    const hasReceiptMedia =
      (type === 'image' && (imageBase64 || mediaUrl)) ||
      (type === 'document' && (documentBase64 || mediaUrl));

    if (hasReceiptMedia) {
      if (!schoolId) {
        responseText = `${contactName}, para registrar un pago necesitamos que la náutica tenga configurado tu número. Contactalos para que activen el chat.`;
      } else {
        const result = await processWhatsAppReceipt({
          from,
          contactName,
          schoolId,
          ...(imageBase64 && { imageBase64 }),
          ...(documentBase64 && {
            documentBase64,
            ...(documentMimeType && { documentMimeType }),
          }),
          ...(mediaUrl && { mediaUrl }),
        });

        console.log('[whatsapp/incoming] processReceipt resultado:', result.ok ? { paymentId: (result as { paymentId?: string }).paymentId } : { error: (result as { error?: string }).error });

        if (result.ok) {
          const amountStr =
            result.amount != null ? ` $${Number(result.amount).toLocaleString('es-AR')}` : '';
          responseText = `¡Gracias ${contactName}! Recibimos tu comprobante${amountStr}. Lo vamos a verificar y te confirmamos en breve.`;
        } else {
          responseText = result.error;
        }
      }
    } else {
      if (!schoolId) {
        responseText = `${contactName}, para usar este chat necesitamos que la náutica tenga configurado tu número. Contactalos para que activen el chat.`;
      } else {
        const clients = await findClientsByPhone(schoolId, from);

        if (clients.length === 0) {
          responseText =
            'No encontramos tu número asociado a un cliente. Contactá a la náutica para que registren tu teléfono.';
        } else {
          const clientName = clients[0].name;

          if (isAffirmativePaymentIntent(text)) {
            responseText = `Perfecto ${clientName}. Enviá la *imagen o PDF* del comprobante de transferencia o pago, y lo procesamos.`;
          } else {
            responseText = `Hola ${clientName}! ¿Querés cargar un pago manual? Respondé *SÍ* para enviar tu comprobante.`;
          }
        }
      }
    }

    const sent = await sendWhatsAppViaNotificasHub({
      to: from,
      text: responseText,
      tenantId,
    });

    if (!sent) {
      console.warn('[whatsapp/incoming] No se pudo enviar respuesta a', from);
    }

    return NextResponse.json({ ok: true, received: true, replied: sent });
  } catch (err) {
    console.error('[whatsapp/incoming]', err);
    return NextResponse.json({ error: 'Error al procesar' }, { status: 500 });
  }
}
