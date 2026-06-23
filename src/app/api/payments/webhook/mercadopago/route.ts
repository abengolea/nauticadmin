/**
 * GET/POST /api/payments/webhook/mercadopago?schoolId=xxx
 * Recibe notificaciones IPN/Webhook de Mercado Pago (topic=payment, id=payment_id).
 * La notification_url incluye schoolId para usar el access_token de esa escuela
 * y consultar el pago en la API de MP.
 *
 * IPN envía topic e id por query. Webhooks pueden enviar type y data.id en el body.
 * Responder 200 rápido y procesar después para no agotar el timeout de MP.
 */

import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import {
  updatePlayerStatus,
  getMercadoPagoConnection,
} from '@/lib/payments/db';
import { ingestPayment } from '@/lib/duplicate-payments/payment-ingestion';
import { sendEmailEvent } from '@/lib/payments/email-events';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import type admin from 'firebase-admin';

/**
 * Valida la firma HMAC-SHA256 que MercadoPago envía en el header x-signature.
 * Formato: "ts=<timestamp>,v1=<hash>"
 * El mensaje firmado es: "id:<paymentId>;request-id:<x-request-id>;ts:<timestamp>"
 * Retorna true si la firma es válida o si no hay MERCADOPAGO_WEBHOOK_SECRET configurado
 * (para no romper entornos de desarrollo sin la variable).
 */
function validateMercadoPagoSignature(request: Request, paymentId: string | null): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true; // Sin secret configurado: no validar (dev/staging)

  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id') ?? '';
  if (!xSignature) return false;

  const ts = xSignature.match(/ts=([^,]+)/)?.[1];
  const v1 = xSignature.match(/v1=([^,]+)/)?.[1];
  if (!ts || !v1) return false;

  const message = `id:${paymentId};request-id:${xRequestId};ts:${ts}`;
  const expected = createHmac('sha256', secret).update(message).digest('hex');
  return expected === v1;
}

/** external_reference que guardamos al crear la preferencia: schoolId|playerId|period */
function parseExternalReference(ref: string): { schoolId: string; playerId: string; period: string } | null {
  const parts = ref.split('|');
  if (parts.length !== 3) return null;
  const [schoolId, playerId, period] = parts;
  if (!schoolId || !playerId || !period) return null;
  return { schoolId, playerId, period };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const topic = url.searchParams.get('topic');
  const id = url.searchParams.get('id');
  const schoolId = url.searchParams.get('schoolId');

  if (!validateMercadoPagoSignature(request, id)) {
    return NextResponse.json({ ok: true }); // Responder 200 para que MP no reintente con firma inválida
  }

  return processNotification({ topic, paymentId: id, schoolId });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const schoolId = url.searchParams.get('schoolId');
  let topic: string | null = url.searchParams.get('topic');
  let paymentId: string | null = url.searchParams.get('id');
  try {
    const body = await request.json().catch(() => ({}));
    if (!topic) topic = body.type ?? body.topic ?? null;
    if (!paymentId) paymentId = body.data?.id ?? body.id ?? null;
  } catch {
    // body vacío o no JSON
  }

  if (!validateMercadoPagoSignature(request, paymentId)) {
    return NextResponse.json({ ok: true }); // Responder 200 para que MP no reintente con firma inválida
  }

  return processNotification({ topic, paymentId, schoolId });
}

async function processNotification(params: {
  topic: string | null;
  paymentId: string | null;
  schoolId: string | null;
}) {
  const { topic, paymentId, schoolId } = params;

  // Siempre responder 200 a MP para que no reintente
  if (topic !== 'payment' || !paymentId || !schoolId) {
    return NextResponse.json({ ok: true });
  }

  const db = getAdminFirestore();

  const conn = await getMercadoPagoConnection(db, schoolId);
  if (!conn?.access_token) {
    console.warn('[webhook/mercadopago] No token for schoolId:', schoolId);
    return NextResponse.json({ ok: true });
  }

  const client = new MercadoPagoConfig({
    accessToken: conn.access_token,
    options: { timeout: 8000 },
  });
  const paymentClient = new Payment(client);

  let payment: { status?: string; external_reference?: string; transaction_amount?: number; currency_id?: string };
  try {
    const res = await paymentClient.get({ id: paymentId });
    payment = {
      status: res.status,
      external_reference: res.external_reference,
      transaction_amount: res.transaction_amount,
      currency_id: res.currency_id,
    };
  } catch (e) {
    console.error('[webhook/mercadopago] GET payment failed', paymentId, e);
    return NextResponse.json({ ok: true });
  }

  if (payment.status !== 'approved') {
    return NextResponse.json({ ok: true });
  }

  const ref = parseExternalReference(payment.external_reference ?? '');
  if (!ref) {
    console.warn('[webhook/mercadopago] Invalid external_reference:', payment.external_reference);
    return NextResponse.json({ ok: true });
  }

  const { playerId, period } = ref;
  const amount = payment.transaction_amount ?? 0;
  const currency = payment.currency_id ?? 'ARS';

  const now = new Date();

  try {
    const result = await ingestPayment(db, {
      provider: 'mercadopago',
      providerPaymentId: String(paymentId),
      customerId: playerId,
      schoolId,
      period,
      amount,
      currency,
      paidAt: now,
      method: 'card',
      reference: payment.external_reference ?? null,
      status: 'accredited',
    });

    if (result.isDuplicateTechnical) {
      return NextResponse.json({ ok: true });
    }

    await updatePlayerStatus(db, schoolId, playerId, 'active');

    // Solo enviar email recibo si NO hay caso de duplicado abierto
    if (!result.duplicateCaseId) {
      const playerRef = db.collection('schools').doc(schoolId).collection('players').doc(playerId);
      const playerSnap = await playerRef.get();
      const playerData = playerSnap.data();
      const playerName = playerData
        ? `${playerData.firstName ?? ''} ${playerData.lastName ?? ''}`.trim()
        : 'Jugador';
      const toEmail = playerData?.email;
      if (toEmail) {
        try {
          await sendEmailEvent({
            db: db as admin.firestore.Firestore,
            type: 'payment_receipt',
            playerId,
            schoolId,
            period,
            to: toEmail,
            playerName,
            amount,
            currency,
            paidAt: now,
          });
        } catch (emailErr) {
          console.warn('[webhook/mercadopago] Email no enviado:', emailErr);
        }
      }
    }
  } catch (err) {
    console.error('[webhook/mercadopago] ingestPayment failed', err);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
