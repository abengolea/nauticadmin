/**
 * GET /api/reconciliation/pending-aliases?schoolId=xxx
 * Lista alias pendientes (Cuenta + Pagador) para asignar manualmente en Sin match.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { REC_COLLECTIONS } from '@/lib/reconciliation';

export const dynamic = 'force-dynamic';

export type PendingAlias = {
  id: string;
  pagador_raw: string;
  cliente_raw: string;
  created_at: string;
};

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

    const [pendingSnap, playersSnap] = await Promise.all([
      db
        .collection('schools')
        .doc(schoolId)
        .collection(REC_COLLECTIONS.pendingPayerAliases)
        .get(),
      db.collection('schools').doc(schoolId).collection('players').get(),
    ]);

    const items: PendingAlias[] = pendingSnap.docs
      .map((d) => {
        const data = d.data() as { pagador_raw?: string; cliente_raw?: string; created_at?: string };
        return {
          id: d.id,
          pagador_raw: data.pagador_raw ?? '',
          cliente_raw: data.cliente_raw ?? '',
          created_at: data.created_at ?? '',
        };
      })
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    const players = playersSnap.docs.map((d) => {
      const data = d.data() as { firstName?: string; lastName?: string; tutorContact?: { name?: string } };
      const fullName =
        (data.tutorContact?.name ?? `${data.lastName ?? ''} ${data.firstName ?? ''}`.trim()).trim() ||
        `${data.lastName ?? ''} ${data.firstName ?? ''}`.trim();
      return { id: d.id, displayName: fullName || d.id };
    });
    players.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return NextResponse.json({ ok: true, items, players });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[reconciliation/pending-aliases]', e);
    return NextResponse.json(
      { error: 'Error al listar alias pendientes', detail: message },
      { status: 500 }
    );
  }
}
