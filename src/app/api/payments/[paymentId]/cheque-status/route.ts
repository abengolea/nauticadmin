/**
 * PATCH /api/payments/[paymentId]/cheque-status
 * Actualiza el estado de un cobro con cheque: cheque_cobrado o cheque_rechazado.
 * Si cheque_cobrado: marca como approved, activa jugador, envía recibo.
 * Si cheque_rechazado: marca como rejected (va a rechazados).
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { updatePlayerStatus } from '@/lib/payments/db';
import { sendEmailEvent } from '@/lib/payments/email-events';
import { COLLECTIONS } from '@/lib/payments/constants';
import type admin from 'firebase-admin';
import { z } from 'zod';

const bodySchema = z.object({
  schoolId: z.string().min(1),
  chequeStatus: z.enum(['cheque_cobrado', 'cheque_rechazado']),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { paymentId } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { schoolId, chequeStatus } = parsed.data;

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const paymentRef = db.collection(COLLECTIONS.payments).doc(paymentId);
    const paymentSnap = await paymentRef.get();

    if (!paymentSnap.exists) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }

    const paymentData = paymentSnap.data()!;
    if (paymentData.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Pago no pertenece a esta escuela' }, { status: 403 });
    }
    if (paymentData.status !== 'espera_cobrar_cheque') {
      return NextResponse.json(
        { error: `Este cobro no es un cheque pendiente (estado: ${paymentData.status})` },
        { status: 400 }
      );
    }

    const playerId = paymentData.playerId as string;
    const amount = paymentData.amount as number;
    const currency = paymentData.currency as string;
    const period = paymentData.period as string;

    const admin = await import('firebase-admin');
    const now = admin.firestore.Timestamp.now();

    if (chequeStatus === 'cheque_cobrado') {
      await paymentRef.update({
        status: 'approved',
        chequeStatus: 'cheque_cobrado',
        paidAt: now,
        updatedAt: now,
      });
      await updatePlayerStatus(db, schoolId, playerId, 'active');

      const playerRef = db
        .collection('schools')
        .doc(schoolId)
        .collection('players')
        .doc(playerId);
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
            paidAt: now.toDate(),
          });
        } catch (e) {
          console.warn('[payments/cheque-status] Email no enviado:', e);
        }
      }
    } else {
      await paymentRef.update({
        status: 'rejected',
        chequeStatus: 'cheque_rechazado',
        updatedAt: now,
      });
    }

    return NextResponse.json({ success: true, chequeStatus });
  } catch (err) {
    console.error('[payments/cheque-status PATCH]', err);
    return NextResponse.json({ error: 'Error al actualizar estado del cheque' }, { status: 500 });
  }
}
