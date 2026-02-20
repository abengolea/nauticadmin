/**
 * GET /api/reconciliation/list?schoolId=xxx&importBatchId=xxx&tab=auto|review|nomatch|conflict
 * Lista pagos y matches para la pantalla de conciliación.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { REC_COLLECTIONS } from '@/lib/reconciliation';
import type { RecPayment, RecMatch, RecClient } from '@/lib/reconciliation/types';

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const importBatchId = searchParams.get('importBatchId');
    const tab = searchParams.get('tab') as 'auto' | 'review' | 'nomatch' | 'conflict' | null;
    const filterApellido = searchParams.get('apellido') ?? '';
    const filterImporteMin = searchParams.get('importeMin');
    const filterImporteMax = searchParams.get('importeMax');

    if (!schoolId) {
      return NextResponse.json({ error: 'Falta schoolId' }, { status: 400 });
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
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const paymentsRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.payments);
    const matchesRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.matches);
    const clientsRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.clients);

    let paymentsSnap;
    if (importBatchId) {
      paymentsSnap = await paymentsRef
        .where('import_batch_id', '==', importBatchId)
        .get();
    } else {
      paymentsSnap = await paymentsRef.orderBy('created_at', 'desc').limit(500).get();
    }
    const matchesSnap = await matchesRef.get();
    const clientsSnap = await clientsRef.get();

    const matchesById = new Map<string, RecMatch>();
    for (const d of matchesSnap.docs) {
      matchesById.set(d.id, d.data() as RecMatch);
    }
    const clientsById = new Map<string, RecClient>();
    for (const d of clientsSnap.docs) {
      clientsById.set(d.id, d.data() as RecClient);
    }

    type PaymentWithMatch = RecPayment & { match?: RecMatch };
    const docs = [...paymentsSnap.docs];
    if (importBatchId) {
      docs.sort((a, b) => {
        const ra = (a.data() as RecPayment).row_index ?? 0;
        const rb = (b.data() as RecPayment).row_index ?? 0;
        return ra - rb;
      });
    }

    const items: PaymentWithMatch[] = [];
    for (const d of docs) {
      const pay = d.data() as RecPayment;
      const match = pay.match_id ? matchesById.get(pay.match_id) : undefined;

      let include = true;
      if (tab === 'auto') include = pay.match_status === 'auto' || pay.match_status === 'confirmed';
      else if (tab === 'review')
        include =
          pay.match_status === 'pending' &&
          match &&
          (match.top_candidates[0]?.score ?? 0) >= 75 &&
          (match.top_candidates[0]?.score ?? 0) < 90;
      else if (tab === 'nomatch')
        include =
          pay.match_status === 'pending' &&
          match &&
          (match.top_candidates[0]?.score ?? 0) < 75;
      else if (tab === 'conflict')
        include =
          pay.match_status === 'pending' &&
          match &&
          match.top_candidates.length >= 2 &&
          (match.top_candidates[0]?.score ?? 0) - (match.top_candidates[1]?.score ?? 0) < 5;

      if (filterApellido && !pay.payer_raw.toLowerCase().includes(filterApellido.toLowerCase())) {
        include = false;
      }
      if (filterImporteMin && pay.amount < parseFloat(filterImporteMin)) include = false;
      if (filterImporteMax && pay.amount > parseFloat(filterImporteMax)) include = false;

      if (include) {
        items.push({ ...pay, match, payment_id: pay.payment_id ?? d.id });
      }
    }

    const clients = Array.from(clientsById.values());

    const res = NextResponse.json({
      ok: true,
      items,
      clients,
      importBatchId,
    });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[reconciliation/list]', e);
    return NextResponse.json(
      { error: 'Error al listar conciliación', detail: message },
      { status: 500 }
    );
  }
}
