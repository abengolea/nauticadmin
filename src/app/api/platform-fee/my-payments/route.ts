/**
 * GET /api/platform-fee/my-payments?schoolId=xxx
 * Lista pagos de mensualidad de la escuela a la plataforma (para admin/coach de la escuela).
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { listSchoolFeePayments } from '@/lib/payments/platform-fee';
import { verifyIdToken } from '@/lib/auth-server';

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

    const platformSnap = await db.collection('platformUsers').doc(auth.uid).get();
    const isSuperAdmin = (platformSnap.data() as { super_admin?: boolean })?.super_admin === true;
    const userInSchool = await db.collection('schools').doc(schoolId).collection('users').doc(auth.uid).get();
    const userData = userInSchool.data() as { role?: string } | undefined;
    const isSchoolAdmin = userData?.role === 'school_admin';
    if (!isSuperAdmin && (!userInSchool.exists || !isSchoolAdmin)) {
      return NextResponse.json({ error: 'Solo el administrador de la escuela puede ver el historial de mensualidades' }, { status: 403 });
    }

    const payments = await listSchoolFeePayments(db, { schoolId, limit: 100 });

    return NextResponse.json({
      payments: payments.map((p) => ({
        ...p,
        paidAt: p.paidAt?.toISOString(),
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error('[platform-fee/my-payments]', e);
    return NextResponse.json(
      { error: 'Error al obtener pagos' },
      { status: 500 }
    );
  }
}
