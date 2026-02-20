/**
 * GET /api/payments/players-status?schoolId=...
 * Devuelve el estado de pagos de todos los jugadores: morosos (inscripción/cuota) y ropa pendiente.
 * Solo admin de escuela o super admin.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import {
  computeDelinquents,
  getClothingPendingByPlayerMap,
  getAllApprovedPaymentsForSchool,
  getDelinquentsFromUnapplied,
} from '@/lib/payments/db';

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId requerido' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const uid = auth.uid;

    const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${uid}`).get();
    const platformUserSnap = await db.doc(`platformUsers/${uid}`).get();
    const isSchoolAdmin =
      schoolUserSnap.exists &&
      (schoolUserSnap.data() as { role?: string })?.role === 'school_admin';
    const isSuperAdmin =
      platformUserSnap.exists &&
      (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true;

    if (!isSchoolAdmin && !isSuperAdmin) {
      return NextResponse.json(
        { error: 'Solo el administrador de la escuela puede ver el estado de pagos' },
        { status: 403 }
      );
    }

    const approvedPaymentsMap = await getAllApprovedPaymentsForSchool(db, schoolId);
    const [baseDelinquents, clothingPendingByPlayer] = await Promise.all([
      computeDelinquents(db, schoolId, approvedPaymentsMap),
      getClothingPendingByPlayerMap(db, schoolId, approvedPaymentsMap),
    ]);

    const existingKeys = new Set(baseDelinquents.map((d) => `${d.playerId}|${d.period}`));
    const unappliedDelinquents = await getDelinquentsFromUnapplied(
      db,
      schoolId,
      approvedPaymentsMap,
      existingKeys
    );
    const delinquents = [...baseDelinquents, ...unappliedDelinquents].sort(
      (a, b) => b.daysOverdue - a.daysOverdue
    );

    return NextResponse.json({
      delinquents: delinquents.map((d) => ({
        ...d,
        dueDate: d.dueDate.toISOString(),
      })),
      clothingPendingByPlayer,
    });
  } catch (e) {
    console.error('[payments/players-status]', e);
    return NextResponse.json(
      { error: 'Error al obtener estado de pagos' },
      { status: 500 }
    );
  }
}
