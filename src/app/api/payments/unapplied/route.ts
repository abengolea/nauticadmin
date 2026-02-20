/**
 * GET /api/payments/unapplied?schoolId=xxx&period=YYYY-MM
 * Lista pagos no aplicados (Aplicada=No) con observaciones.
 */

import type admin from 'firebase-admin';
import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { getPlayerNames } from '@/lib/payments/db';

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const period = searchParams.get('period');

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

    const unappliedRef = db.collection('schools').doc(schoolId).collection('unappliedPayments');
    const snap = await unappliedRef.orderBy('importedAt', 'desc').limit(500).get();

    let docs = snap.docs;
    if (period) {
      docs = docs.filter((d) => (d.data() as { period?: string }).period === period);
    }

    const items = docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        schoolId: data.schoolId,
        period: data.period,
        paymentMethod: data.paymentMethod,
        payerRaw: data.payerRaw ?? '',
        playerId: data.playerId ?? null,
        amount: data.amount ?? 0,
        currency: data.currency ?? 'ARS',
        observation: data.observation ?? '',
        importedAt: data.importedAt,
      };
    });

    const playerIds = [...new Set(items.map((i) => i.playerId).filter(Boolean) as string[])];
    const names = playerIds.length > 0 ? await getPlayerNames(db, schoolId, playerIds) : new Map<string, string>();

    const enriched = items.map((i) => ({
      ...i,
      playerName: i.playerId ? names.get(i.playerId) ?? null : null,
    }));

    return NextResponse.json({ ok: true, items: enriched });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[payments/unapplied]', e);
    return NextResponse.json(
      { error: 'Error al listar no aplicados', detail: message },
      { status: 500 }
    );
  }
}
