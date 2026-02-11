/**
 * GET/POST /api/payments/webhook/mercadopago-platform
 * Recibe notificaciones de Mercado Pago para pagos de mensualidad de escuelas a la plataforma.
 * Usa MERCADOPAGO_PLATFORM_ACCESS_TOKEN para consultar el pago.
 * external_reference: platform_fee|schoolId|period
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import {
  findSchoolFeePaymentByProviderId,
  createSchoolFeePayment,
  findApprovedSchoolFeePayment,
} from '@/lib/payments/platform-fee';
import { parsePlatformFeeExternalRef } from '@/lib/payments/mercadopago-platform-preference';
import { MercadoPagoConfig, Payment } from 'mercadopago';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const topic = url.searchParams.get('topic');
  const id = url.searchParams.get('id');
  return processNotification({ topic, paymentId: id });
}

export async function POST(request: Request) {
  let topic: string | null = null;
  let paymentId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    topic = body.type ?? body.topic ?? null;
    paymentId = body.data?.id ?? body.id ?? null;
  } catch {
    // body vacío o no JSON
  }
  const url = new URL(request.url);
  if (!topic) topic = url.searchParams.get('topic');
  if (!paymentId) paymentId = url.searchParams.get('id');
  return processNotification({ topic, paymentId });
}

async function processNotification(params: {
  topic: string | null;
  paymentId: string | null;
}) {
  const { topic, paymentId } = params;

  if (topic !== 'payment' || !paymentId) {
    return NextResponse.json({ ok: true });
  }

  const platformToken = process.env.MERCADOPAGO_PLATFORM_ACCESS_TOKEN;
  if (!platformToken) {
    console.warn('[webhook/mercadopago-platform] No MERCADOPAGO_PLATFORM_ACCESS_TOKEN');
    return NextResponse.json({ ok: true });
  }

  const client = new MercadoPagoConfig({
    accessToken: platformToken,
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
    console.error('[webhook/mercadopago-platform] GET payment failed', paymentId, e);
    return NextResponse.json({ ok: true });
  }

  if (payment.status !== 'approved') {
    return NextResponse.json({ ok: true });
  }

  const ref = parsePlatformFeeExternalRef(payment.external_reference ?? '');
  if (!ref) {
    console.warn('[webhook/mercadopago-platform] Invalid external_reference:', payment.external_reference);
    return NextResponse.json({ ok: true });
  }

  const { schoolId, period } = ref;
  const amount = payment.transaction_amount ?? 0;
  const currency = payment.currency_id ?? 'ARS';

  const db = getAdminFirestore();

  const existing = await findApprovedSchoolFeePayment(db, schoolId, period);
  if (existing) {
    return NextResponse.json({ ok: true });
  }

  const idempotencyKey = `mercadopago_platform_${paymentId}`;
  await createSchoolFeePayment(
    db,
    {
      schoolId,
      period,
      amount,
      currency,
      provider: 'mercadopago',
      providerPaymentId: String(paymentId),
      status: 'approved',
      paidAt: new Date(),
    },
    idempotencyKey
  );

  return NextResponse.json({ ok: true });
}
