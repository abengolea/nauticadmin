/**
 * POST /api/payments/ingest
 * Ingesta un pago (manual, transfer, etc.) con detección de duplicados.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { ingestPayment } from '@/lib/duplicate-payments/payment-ingestion';
import { sendEmailEvent } from '@/lib/payments/email-events';
import { updatePlayerStatus } from '@/lib/payments/db';
import { z } from 'zod';
import type admin from 'firebase-admin';

const ingestSchema = z.object({
  schoolId: z.string().min(1),
  customerId: z.string().min(1),
  period: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(1).default('ARS'),
  provider: z.enum(['mercadopago', 'dlocal', 'stripe', 'transfer', 'manual', 'excel_import']),
  providerPaymentId: z.string().nullable().optional(),
  method: z.enum(['card', 'transfer', 'cash', 'unknown']).optional().default('unknown'),
  reference: z.string().nullable().optional(),
  paidAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();

    const db = getAdminFirestore();

    const schoolUserSnap = await db
      .collection('schools')
      .doc(data.schoolId)
      .collection('users')
      .doc(auth.uid)
      .get();

    if (!schoolUserSnap.exists) {
      return NextResponse.json({ error: 'Sin acceso a esta escuela' }, { status: 403 });
    }

    const role = schoolUserSnap.data()?.role;
    if (role !== 'school_admin' && role !== 'operador') {
      return NextResponse.json(
        { error: 'Solo admin o entrenador puede ingresar pagos' },
        { status: 403 }
      );
    }

    const result = await ingestPayment(db, {
      provider: data.provider,
      providerPaymentId: data.providerPaymentId ?? undefined,
      customerId: data.customerId,
      schoolId: data.schoolId,
      period: data.period,
      amount: data.amount,
      currency: data.currency,
      paidAt,
      method: data.method,
      reference: data.reference ?? undefined,
      status: 'accredited',
    });

    if (result.isDuplicateTechnical) {
      return NextResponse.json({
        ok: true,
        paymentId: result.paymentId,
        isDuplicateTechnical: true,
        message: 'Pago ya registrado (webhook duplicado ignorado)',
      });
    }

    await updatePlayerStatus(db, data.schoolId, data.customerId, 'active');

    // Enviar email recibo solo si NO hay caso de duplicado abierto
    if (!result.duplicateCaseId) {
      const playerRef = db
        .collection('schools')
        .doc(data.schoolId)
        .collection('players')
        .doc(data.customerId);
      const playerSnap = await playerRef.get();
      const playerData = playerSnap.data();
      const toEmail = playerData?.email as string | undefined;
      const playerName = playerData
        ? `${playerData.firstName ?? ''} ${playerData.lastName ?? ''}`.trim()
        : 'Jugador';
      if (toEmail) {
        try {
          await sendEmailEvent({
            db: db as admin.firestore.Firestore,
            type: 'payment_receipt',
            playerId: data.customerId,
            schoolId: data.schoolId,
            period: data.period,
            to: toEmail,
            playerName,
            amount: data.amount,
            currency: data.currency,
            paidAt,
          });
        } catch {
          // No fallar por email
        }
      }
    }

    return NextResponse.json({
      ok: true,
      paymentId: result.paymentId,
      duplicateCaseId: result.duplicateCaseId,
      created: result.created,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/payments/ingest]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
