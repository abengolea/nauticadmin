/**
 * POST /api/payments/inform-from-whatsapp
 * Recibe comprobante de pago enviado por WhatsApp (imagen o PDF).
 * Crea pago con status pending_verification para cheque posterior del operador.
 * Valida x-internal-token === INTERNAL_SECRET.
 *
 * Usa processWhatsAppReceipt (lógica compartida con incoming).
 * Esta ruta sirve para tests manuales o llamadas externas.
 */

import { NextResponse } from 'next/server';
import { processWhatsAppReceipt } from '@/lib/whatsapp/process-receipt';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET?.trim();

export async function POST(request: Request) {
  try {
    const token = request.headers.get('x-internal-token') ?? request.headers.get('x-internal-secret');
    if (!INTERNAL_SECRET || token !== INTERNAL_SECRET) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const from = (body.from as string) ?? (body.phone as string) ?? '';
    const contactName = (body.contactName as string) ?? (body.contact_name as string) ?? 'Usuario';
    const schoolId = (body.schoolId as string) ?? (body.tenantId as string) ?? '';
    const imageBase64 = body.imageBase64 as string | undefined;
    const mediaUrl = body.mediaUrl as string | undefined;
    const documentBase64 = body.documentBase64 as string | undefined;
    const documentMimeType = body.documentMimeType as string | undefined;

    if (!schoolId?.trim()) {
      return NextResponse.json({ error: 'schoolId o tenantId requerido' }, { status: 400 });
    }
    if (!from?.trim()) {
      return NextResponse.json({ error: 'from (teléfono) requerido' }, { status: 400 });
    }

    const result = await processWhatsAppReceipt({
      from,
      contactName,
      schoolId,
      imageBase64,
      documentBase64,
      mediaUrl,
      documentMimeType,
    });

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        paymentId: result.paymentId,
        amount: result.amount,
        playerId: result.playerId,
        playersMatched: result.playersMatched,
      });
    }

    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 400 }
    );
  } catch (err) {
    console.error('[inform-from-whatsapp]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al procesar' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
