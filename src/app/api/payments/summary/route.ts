/**
 * GET /api/payments/summary?schoolId=xxx
 * Devuelve subtotales: cobrados, no aplicados y morosos.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { listPayments, getArchivedPlayerIds } from '@/lib/payments/db';
import { computeDelinquents } from '@/lib/payments/db';

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');

    if (!schoolId) {
      return NextResponse.json({ error: 'Falta schoolId' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const archivedIds = await getArchivedPlayerIds(db, schoolId);

    // Cobrados: pagos aprobados
    const { payments: rawPayments } = await listPayments(db, schoolId, {
      status: 'approved',
      limit: 10000,
      offset: 0,
    });
    const paymentsFiltered = rawPayments.filter((p) => !archivedIds.has(p.playerId));
    const collectedCount = paymentsFiltered.length;
    const collectedTotal = paymentsFiltered.reduce((s, p) => s + p.amount, 0);

    // No aplicados
    const unappliedRef = db.collection('schools').doc(schoolId).collection('unappliedPayments');
    const unappliedSnap = await unappliedRef.get();
    const unappliedItems = unappliedSnap.docs.map((d) => d.data());
    const unappliedCount = unappliedItems.length;
    const unappliedTotal = unappliedItems.reduce((s, i) => s + ((i.amount as number) ?? 0), 0);

    // Morosos
    const delinquents = await computeDelinquents(db, schoolId);
    const delinquentsCount = delinquents.length;
    const delinquentsTotal = delinquents.reduce((s, d) => s + d.amount, 0);

    return NextResponse.json({
      collected: { count: collectedCount, total: collectedTotal },
      unapplied: { count: unappliedCount, total: unappliedTotal },
      delinquents: { count: delinquentsCount, total: delinquentsTotal },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[payments/summary]', e);
    return NextResponse.json(
      { error: 'Error al obtener resumen', detail: message },
      { status: 500 }
    );
  }
}
