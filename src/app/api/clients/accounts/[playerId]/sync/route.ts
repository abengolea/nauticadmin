/**
 * POST /api/clients/accounts/[playerId]/sync
 * Sincroniza pagos aprobados históricos a la cuenta corriente del cliente.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken, isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { recordPaymentInClientAccountById, isClientAccountEnabled } from '@/lib/client-accounts/db';
import { COLLECTIONS } from '@/lib/payments/constants';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { playerId } = await params;
    const body = await request.json();
    const schoolId = body?.schoolId as string | undefined;

    if (!schoolId?.trim()) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta náutica' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const enabled = await isClientAccountEnabled(db, schoolId, playerId);
    if (!enabled) {
      return NextResponse.json(
        { error: 'La cuenta corriente no está habilitada para este cliente' },
        { status: 400 }
      );
    }

    const snap = await db
      .collection(COLLECTIONS.payments)
      .where('schoolId', '==', schoolId)
      .where('playerId', '==', playerId)
      .where('status', '==', 'approved')
      .get();

    let synced = 0;
    for (const doc of snap.docs) {
      await recordPaymentInClientAccountById(db, doc.id);
      synced++;
    }

    return NextResponse.json({ success: true, synced });
  } catch (err) {
    console.error('[clients/accounts/sync POST]', err);
    return NextResponse.json({ error: 'Error al sincronizar cuenta corriente' }, { status: 500 });
  }
}
