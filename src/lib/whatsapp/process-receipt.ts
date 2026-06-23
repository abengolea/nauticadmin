/**
 * Lógica compartida para procesar comprobantes de pago enviados por WhatsApp.
 * Usada por incoming (llamada directa) e inform-from-whatsapp (API).
 * Evita la llamada HTTP interna entre rutas del mismo servidor.
 */

import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { createPayment } from '@/lib/payments/db';
import { parsePaymentReceiptFromFile } from '@/ai/flows/parse-payment-receipt';
import { findClientsByPhone } from '@/lib/whatsapp/find-client-by-phone';
import type { ParsedPaymentReceipt } from '@/ai/flows/parse-payment-receipt';

export interface ProcessReceiptParams {
  from: string;
  contactName: string;
  schoolId: string;
  imageBase64?: string;
  documentBase64?: string;
  mediaUrl?: string;
  documentMimeType?: string;
}

export interface ProcessReceiptSuccess {
  ok: true;
  paymentId: string;
  amount?: number;
  playerId: string;
  playersMatched: number;
}

export interface ProcessReceiptError {
  ok: false;
  error: string;
  code: string;
}

export type ProcessReceiptResult = ProcessReceiptSuccess | ProcessReceiptError;

/** Extrae YYYY-MM desde un string de fecha. */
function extractPeriodFromDate(dateStr: string | undefined): string {
  if (!dateStr?.trim()) return new Date().toISOString().slice(0, 7);
  const m = /^(\d{4})-(\d{2})/.exec(dateStr);
  if (m) return `${m[1]}-${m[2]}`;
  const dmy = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(dateStr);
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}`;
  return new Date().toISOString().slice(0, 7);
}

/**
 * Procesa un comprobante de pago (imagen o PDF) enviado por WhatsApp.
 * Sube a Storage, extrae datos con IA, crea pago pending_verification.
 */
export async function processWhatsAppReceipt(
  params: ProcessReceiptParams
): Promise<ProcessReceiptResult> {
  const { from, contactName, schoolId, imageBase64, documentBase64, mediaUrl, documentMimeType } =
    params;

  let fileBuffer: Buffer;
  let mimeType: string;

  if (imageBase64) {
    const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    fileBuffer = Buffer.from(base64, 'base64');
    mimeType = 'image/jpeg';
  } else if (documentBase64) {
    const base64 = documentBase64.replace(/^data:[^;]+;base64,/, '');
    fileBuffer = Buffer.from(base64, 'base64');
    mimeType = documentMimeType?.trim() || 'application/pdf';
  } else if (mediaUrl) {
    let res: Response;
    try {
      res = await fetch(mediaUrl);
    } catch (fetchErr) {
      console.error('[process-receipt] Error al descargar mediaUrl:', fetchErr);
      return {
        ok: false,
        error:
          'No pudimos obtener el archivo. Las URLs de Meta expiran rápido. NotificasHub debe enviar imageBase64/documentBase64.',
        code: 'MEDIA_DOWNLOAD_FAILED',
      };
    }
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[process-receipt] mediaUrl fetch falló:', res.status, res.statusText, errBody.slice(0, 200));
      return {
        ok: false,
        error: 'No pudimos descargar el archivo (la URL puede haber expirado). Por favor enviá la imagen de nuevo.',
        code: 'MEDIA_FETCH_FAILED',
      };
    }
    const arr = await res.arrayBuffer();
    fileBuffer = Buffer.from(arr);
    mimeType =
      documentMimeType?.trim() ||
      res.headers.get('content-type')?.split(';')[0]?.trim() ||
      (mediaUrl.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  } else {
    return {
      ok: false,
      error: 'Se requiere imageBase64, documentBase64 o mediaUrl con el comprobante (imagen o PDF)',
      code: 'MISSING_MEDIA',
    };
  }

  if (fileBuffer.length === 0 || fileBuffer.length > 10 * 1024 * 1024) {
    return {
      ok: false,
      error: 'Archivo inválido o demasiado grande (máx. 10MB)',
      code: 'INVALID_FILE',
    };
  }

  const players = await findClientsByPhone(schoolId, from);
  if (players.length === 0) {
    return {
      ok: false,
      error: 'No encontramos tu número asociado a un cliente. Contactá a la náutica para que registren tu teléfono.',
      code: 'PLAYER_NOT_FOUND',
    };
  }

  const playerId = players[0].id;
  const db = getAdminFirestore();
  const storage = getAdminStorage();
  const bucket = storage.bucket();
  const receiptId = crypto.randomUUID();
  const ext = mimeType.includes('pdf')
    ? 'pdf'
    : mimeType.includes('png')
      ? 'png'
      : mimeType.includes('webp')
        ? 'webp'
        : 'jpg';
  const storagePath = `schools/${schoolId}/payments/whatsapp-${receiptId}/comprobante.${ext}`;
  await bucket.file(storagePath).save(fileBuffer, { metadata: { contentType: mimeType } });

  let extracted: ParsedPaymentReceipt | null = null;
  try {
    const base64 = fileBuffer.toString('base64');
    const result = await parsePaymentReceiptFromFile(base64, mimeType);
    extracted = result.extracted;
  } catch (parseErr) {
    console.warn('[process-receipt] Parse IA falló:', parseErr);
  }

  const amount = extracted?.amount ?? 0;
  const period = extractPeriodFromDate(extracted?.date);

  // Firestore no acepta undefined; filtrar propiedades undefined del objeto extraído
  const sanitizedExtracted = extracted
    ? (Object.fromEntries(
        Object.entries(extracted).filter(([, v]) => v !== undefined)
      ) as typeof extracted)
    : undefined;

  const payment = await createPayment(db, {
    playerId,
    schoolId,
    period,
    amount,
    currency: extracted?.currency ?? 'ARS',
    provider: 'whatsapp',
    status: 'pending_verification',
    metadata: {
      informadoPorWhatsapp: true,
      whatsappFrom: from,
      whatsappContactName: contactName,
      comprobanteStoragePath: storagePath,
      ...(sanitizedExtracted && Object.keys(sanitizedExtracted).length > 0 && {
        extractedReceiptData: sanitizedExtracted,
      }),
    },
  });

  return {
    ok: true,
    paymentId: payment.id,
    amount: extracted?.amount,
    playerId,
    playersMatched: players.length,
  };
}
