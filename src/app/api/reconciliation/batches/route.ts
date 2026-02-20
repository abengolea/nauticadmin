/**
 * GET /api/reconciliation/batches?schoolId=xxx
 * Lista los lotes de importación para seleccionar en conciliación.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { REC_COLLECTIONS } from '@/lib/reconciliation';

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

    const batchesRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.importBatches);

    const snap = await batchesRef.orderBy('created_at', 'desc').limit(20).get();

    const batches = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        created_at: data.created_at,
        payments_count: data.payments_count ?? 0,
        auto_count: data.auto_count ?? 0,
        review_count: data.review_count ?? 0,
        nomatch_count: data.nomatch_count ?? 0,
        conflict_count: data.conflict_count ?? 0,
      };
    });

    return NextResponse.json({ ok: true, batches });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[reconciliation/batches]', e);
    return NextResponse.json(
      { error: 'Error al listar lotes', detail: message },
      { status: 500 }
    );
  }
}
