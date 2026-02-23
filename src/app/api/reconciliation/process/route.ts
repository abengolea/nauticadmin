/**
 * POST /api/reconciliation/process
 * Procesa los Excel de clientes y pagos, hace matching y persiste.
 * Solo school_admin o super_admin.
 */

import { NextResponse } from 'next/server';
import type admin from 'firebase-admin';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { Timestamp } from 'firebase-admin/firestore';
import {
  REC_COLLECTIONS,
  normalizeAndTokenize,
  matchPayment,
  makePaymentId,
  parseClientsExcel,
  parsePaymentsExcel,
  tokenSetRatio,
} from '@/lib/reconciliation';
import type { RecClient, RecPayment, RecMatch, PayerAlias } from '@/lib/reconciliation/types';

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { schoolId, clientsRows, paymentsRows } = body as {
      schoolId?: string;
      clientsRows?: (string | number)[][];
      paymentsRows?: (string | number)[][];
    };

    if (!schoolId || !Array.isArray(clientsRows) || !Array.isArray(paymentsRows)) {
      return NextResponse.json(
        { error: 'Faltan schoolId, clientsRows o paymentsRows' },
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
      return NextResponse.json(
        { error: 'Solo el administrador puede usar conciliación' },
        { status: 403 }
      );
    }

    const { clients: parsedClients, error: clientsError } = parseClientsExcel(clientsRows);
    if (clientsError) {
      return NextResponse.json({ error: `Excel Clientes: ${clientsError}` }, { status: 400 });
    }

    const { payments: parsedPayments, error: paymentsError } = parsePaymentsExcel(paymentsRows);
    if (paymentsError) {
      return NextResponse.json({ error: `Excel Pagos: ${paymentsError}` }, { status: 400 });
    }

    const importBatchId = generateId();
    const now = new Date().toISOString();

    const recClientsRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.clients);
    const recPaymentsRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.payments);
    const recMatchesRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.matches);
    const aliasesRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.payerAliases);

    const clients: RecClient[] = [];
    const batch1 = db.batch();
    for (let i = 0; i < parsedClients.length; i++) {
      const c = parsedClients[i]!;
      const { normalized, tokens } = normalizeAndTokenize(c.full_name_raw);
      const clientId = `cli_${importBatchId}_${i}`;
      const rec: RecClient = {
        client_id: clientId,
        full_name_raw: c.full_name_raw,
        full_name_norm: normalized,
        tokens,
        row_index: c.row_index,
        import_batch_id: importBatchId,
        created_at: now,
      };
      clients.push(rec);
      const ref = recClientsRef.doc(clientId);
      batch1.set(ref, rec);
    }
    await batch1.commit();

    const aliasesSnap = await aliasesRef.get();
    const aliases = new Map<string, PayerAlias & { _resolved_client_id?: string }>();
    const aliasDataList = aliasesSnap.docs.map((d) => d.data() as PayerAlias);

    const playersSnap = await db.collection(`schools/${schoolId}/players`).get();

    for (const data of aliasDataList) {
      let enriched = { ...data } as PayerAlias & { _resolved_client_id?: string };
      if (data.player_id && !data.client_id) {
        const playerDoc = playersSnap.docs.find((d) => d.id === data.player_id);
        if (playerDoc) {
          const d = playerDoc.data() as { firstName?: string; lastName?: string; tutorContact?: { name?: string } };
          const fullName = (d.tutorContact?.name ?? `${d.lastName ?? ''} ${d.firstName ?? ''}`.trim()).trim();
          const { normalized: playerNorm } = normalizeAndTokenize(fullName);
          const clientMatch = clients.find((c) => c.full_name_norm === playerNorm);
          if (clientMatch) {
            enriched._resolved_client_id = clientMatch.client_id;
          } else {
            const { tokens: playerTokens } = normalizeAndTokenize(fullName);
            let best: { client: RecClient; score: number } | null = null;
            for (const c of clients) {
              const score = tokenSetRatio(playerTokens, c.tokens);
              if (score >= 85 && (!best || score > best.score)) best = { client: c, score };
            }
            if (best) enriched._resolved_client_id = best.client.client_id;
          }
        }
      }
      aliases.set(data.normalized_payer_name, enriched);
    }

    let autoCount = 0;
    let reviewCount = 0;
    let nomatchCount = 0;
    let conflictCount = 0;

    const payments: RecPayment[] = [];
    const matches: RecMatch[] = [];
    const seenPaymentIds = new Set<string>();

    for (let i = 0; i < parsedPayments.length; i++) {
      const p = parsedPayments[i]!;
      const paymentId = makePaymentId(
        p.id_usuario,
        importBatchId,
        p.nro_tarjeta,
        p.importe,
        p.row_index
      );

      if (seenPaymentIds.has(paymentId)) continue;
      seenPaymentIds.add(paymentId);

      const matchResult = matchPayment(
        {
          dato_opcional_1: p.dato_opcional_1,
          dato_opcional_2: p.dato_opcional_2,
          id_usuario: p.id_usuario,
        },
        clients,
        aliases
      );
      matchResult.payment_id = paymentId;

      if (matchResult.decision === 'auto') autoCount++;
      else if (matchResult.decision === 'review') reviewCount++;
      else if (matchResult.decision === 'no_match') nomatchCount++;
      else if (matchResult.decision === 'conflict') conflictCount++;

      const { normalized: payerNorm } = normalizeAndTokenize(
        `${p.dato_opcional_1} ${p.dato_opcional_2}`.trim()
      );

      const matchId = `match_${paymentId}`;
      const isAuto = matchResult.decision === 'auto' && matchResult.client_id;

      const recPayment: RecPayment = {
        payment_id: paymentId,
        payer_raw: `${p.dato_opcional_1} ${p.dato_opcional_2}`.trim(),
        payer_norm: payerNorm,
        amount: p.importe,
        id_usuario: p.id_usuario,
        nro_tarjeta: p.nro_tarjeta,
        aplicada: p.aplicada,
        observaciones: p.observaciones,
        import_batch_id: importBatchId,
        created_at: now,
        row_index: p.row_index,
        ...(isAuto && matchResult.client_id && { matched_client_id: matchResult.client_id }),
        match_status: isAuto ? 'auto' : 'pending',
        match_id: matchId,
      };
      payments.push(recPayment);

      const recMatch: RecMatch = {
        match_id: matchId,
        payment_id: paymentId,
        client_id: matchResult.client_id ?? '',
        status: isAuto ? 'auto' : 'pending',
        score: matchResult.score,
        top_candidates: matchResult.top_candidates,
        explanation: matchResult.explanation,
        ...(matchResult.reason && { reason: matchResult.reason }),
        import_batch_id: importBatchId,
        created_at: now,
      };
      matches.push(recMatch);
    }

    const batch2 = db.batch();
    for (const pay of payments) {
      batch2.set(recPaymentsRef.doc(pay.payment_id), pay);
    }
    for (const m of matches) {
      batch2.set(recMatchesRef.doc(m.match_id), m);
    }
    await batch2.commit();

    const batchDoc: admin.firestore.DocumentData = {
      import_batch_id: importBatchId,
      school_id: schoolId,
      created_at: now,
      created_by: uid,
      clients_count: clients.length,
      payments_count: payments.length,
      auto_count: autoCount,
      review_count: reviewCount,
      nomatch_count: nomatchCount,
      conflict_count: conflictCount,
    };
    await db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.importBatches)
      .doc(importBatchId)
      .set(batchDoc);

    return NextResponse.json({
      ok: true,
      import_batch_id: importBatchId,
      clients_count: clients.length,
      payments_count: payments.length,
      auto_count: autoCount,
      review_count: reviewCount,
      nomatch_count: nomatchCount,
      conflict_count: conflictCount,
      message: `Procesado: ${autoCount} auto, ${reviewCount} revisar, ${nomatchCount} sin match, ${conflictCount} conflictos.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[reconciliation/process]', e);
    return NextResponse.json(
      { error: 'Error al procesar conciliación', detail: message },
      { status: 500 }
    );
  }
}
