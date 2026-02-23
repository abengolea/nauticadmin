/**
 * POST /api/reconciliation/confirm-pending-alias
 * Asigna un alias pendiente a un jugador y lo mueve a recPayerAliases.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { REC_COLLECTIONS } from '@/lib/reconciliation';
import { normalizeAndTokenize } from '@/lib/reconciliation';

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { schoolId, pendingId, playerId } = body as {
      schoolId?: string;
      pendingId?: string;
      playerId?: string;
    };

    if (!schoolId || !pendingId || !playerId) {
      return NextResponse.json(
        { error: 'Faltan schoolId, pendingId o playerId' },
        { status: 400 }
      );
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

    const pendingRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.pendingPayerAliases)
      .doc(pendingId);

    const pendingSnap = await pendingRef.get();
    if (!pendingSnap.exists) {
      return NextResponse.json({ error: 'Alias pendiente no encontrado' }, { status: 404 });
    }

    const pending = pendingSnap.data() as { pagador_raw?: string; cliente_raw?: string };
    const pagadorRaw = pending.pagador_raw ?? '';

    const playerRef = db.doc(`schools/${schoolId}/players/${playerId}`);
    const playerSnap = await playerRef.get();
    if (!playerSnap.exists) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    const { normalized: payerNorm } = normalizeAndTokenize(pagadorRaw);
    const aliasId = payerNorm.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 150);
    const aliasRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.payerAliases)
      .doc(aliasId);

    const now = new Date().toISOString();

    const existingAlias = await aliasRef.get();
    if (existingAlias.exists) {
      const prev = existingAlias.data() as { player_id?: string };
      if (prev.player_id !== playerId) {
        await aliasRef.update({
          player_id: playerId,
          updated_at: now,
          updated_by: uid,
        });
      }
    } else {
      await aliasRef.set({
        normalized_payer_name: payerNorm,
        player_id: playerId,
        created_at: now,
        created_by: uid,
      });
    }

    await pendingRef.delete();

    return NextResponse.json({ ok: true, status: 'confirmed' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[reconciliation/confirm-pending-alias]', e);
    return NextResponse.json(
      { error: 'Error al confirmar alias', detail: message },
      { status: 500 }
    );
  }
}
