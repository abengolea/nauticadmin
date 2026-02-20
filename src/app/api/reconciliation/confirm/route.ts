/**
 * POST /api/reconciliation/confirm
 * Confirma o rechaza un match manual. Guarda alias si confirma.
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
    const {
      schoolId,
      paymentId,
      action,
      clientId,
      rejectedReason,
    } = body as {
      schoolId?: string;
      paymentId?: string;
      action: 'confirm' | 'reject';
      clientId?: string;
      rejectedReason?: string;
    };

    if (!schoolId || !paymentId || !action) {
      return NextResponse.json(
        { error: 'Faltan schoolId, paymentId o action' },
        { status: 400 }
      );
    }

    if (action === 'confirm' && !clientId) {
      return NextResponse.json(
        { error: 'Para confirmar se requiere clientId' },
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

    const paymentRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.payments)
      .doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }

    const payment = paymentSnap.data() as {
      match_id?: string;
      payer_raw: string;
      import_batch_id: string;
    };

    const matchId = payment.match_id ?? `match_${paymentId}`;
    const matchRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.matches)
      .doc(matchId);

    const now = new Date().toISOString();

    if (action === 'confirm') {
      const { normalized: payerNorm } = normalizeAndTokenize(payment.payer_raw);

      await matchRef.set(
        {
          status: 'confirmed',
          client_id: clientId,
          confirmed_by: uid,
          confirmed_at: now,
          updated_at: now,
        },
        { merge: true }
      );

      await paymentRef.update({
        matched_client_id: clientId,
        match_status: 'confirmed',
      });

      const aliasId = payerNorm.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 150);
      const aliasRef = db
        .collection('schools')
        .doc(schoolId)
        .collection(REC_COLLECTIONS.payerAliases)
        .doc(aliasId);

      const existingAlias = await aliasRef.get();
      if (existingAlias.exists) {
        const prev = existingAlias.data() as { client_id: string };
        if (prev.client_id !== clientId) {
          await aliasRef.update({
            client_id: clientId,
            updated_at: now,
            updated_by: uid,
          });
        }
      } else {
        await aliasRef.set({
          normalized_payer_name: payerNorm,
          client_id: clientId!,
          created_at: now,
          created_by: uid,
        });
      }

      return NextResponse.json({ ok: true, status: 'confirmed' });
    }

    await matchRef.set(
      {
        status: 'rejected',
        rejected_reason: rejectedReason ?? 'Rechazado por el administrador',
        updated_at: now,
      },
      { merge: true }
    );

    await paymentRef.update({
      matched_client_id: null,
      match_status: 'rejected',
    });

    return NextResponse.json({ ok: true, status: 'rejected' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[reconciliation/confirm]', e);
    return NextResponse.json(
      { error: 'Error al confirmar', detail: message },
      { status: 500 }
    );
  }
}
