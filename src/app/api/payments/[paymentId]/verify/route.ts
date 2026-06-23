/**
 * PATCH /api/payments/[paymentId]/verify
 * Aprueba o rechaza un pago con status pending_verification (ej. informado por WhatsApp).
 * Si se aprueba: status → approved, paidAt → now.
 * Si se rechaza: status → rejected.
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
  action: z.enum(['approve', 'reject']),
  /** Opcional: si el operador corrige el monto antes de aprobar */
  amountOverride: z.number().positive().optional(),
  /** Opcional: si el operador corrige el período */
  periodOverride: z.string().min(1).optional(),
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

    const { schoolId, action, amountOverride, periodOverride } = parsed.data;

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
    if (paymentData.status !== 'pending_verification') {
      return NextResponse.json(
        { error: `Este pago no está pendiente de verificación (estado: ${paymentData.status})` },
        { status: 400 }
      );
    }

    const admin = await import('firebase-admin');
    const now = admin.firestore.Timestamp.now();
    const playerId = paymentData.playerId as string;
    const period = periodOverride ?? (paymentData.period as string);
    const amount = amountOverride ?? (paymentData.amount as number);
    const currency = (paymentData.currency as string) ?? 'ARS';

    if (action === 'approve') {
      const updates: Record<string, unknown> = {
        status: 'approved',
        paidAt: now,
        updatedAt: now,
      };
      if (amountOverride !== undefined) updates.amount = amountOverride;
      if (periodOverride) updates.period = periodOverride;

      await paymentRef.update(updates);
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
          console.warn('[payments/verify] Email no enviado:', e);
        }
      }
    } else {
      await paymentRef.update({
        status: 'rejected',
        updatedAt: now,
      });
    }

    return NextResponse.json({ success: true, action });
  } catch (err) {
    console.error('[payments/verify PATCH]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al verificar' },
      { status: 500 }
    );
  }
}
