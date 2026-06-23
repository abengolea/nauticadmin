/**
 * GET /api/payments/cheques-pendientes?schoolId=...
 * Lista cheques que la náutica RECIBIÓ de clientes (cobros) y están pendientes de cobrar.
 * Alarma: recordar depositar/cobrar los cheques en el banco.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { COLLECTIONS } from '@/lib/payments/constants';

export interface ChequeCobroPendiente {
  paymentId: string;
  playerId: string;
  playerName: string;
  period: string;
  amount: number;
  currency: string;
  chequeDueDate: string;
  createdAt: string;
  isVencido: boolean;
}

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');

    if (!schoolId?.trim()) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const today = new Date().toISOString().slice(0, 10);

    const snap = await db
      .collection(COLLECTIONS.payments)
      .where('schoolId', '==', schoolId)
      .where('status', '==', 'espera_cobrar_cheque')
      .get();

    const cheques: ChequeCobroPendiente[] = [];
    const playerIds = new Set<string>();

    for (const doc of snap.docs) {
      const d = doc.data();
      const chequeDueDate = d.chequeDueDate as string | undefined;
      if (!chequeDueDate) continue;

      playerIds.add(d.playerId as string);
      cheques.push({
        paymentId: doc.id,
        playerId: d.playerId,
        playerName: '',
        period: d.period,
        amount: d.amount,
        currency: d.currency ?? 'ARS',
        chequeDueDate,
        createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? d.createdAt ?? '',
        isVencido: chequeDueDate <= today,
      });
    }

    // Obtener nombres de jugadores
    const playersRef = db.collection('schools').doc(schoolId).collection('players');
    for (const pid of playerIds) {
      const playerSnap = await playersRef.doc(pid).get();
      const pData = playerSnap.data();
      const name = pData
        ? `${pData.firstName ?? ''} ${pData.lastName ?? ''}`.trim() || pid
        : pid;
      for (const c of cheques) {
        if (c.playerId === pid) c.playerName = name;
      }
    }

    cheques.sort((a, b) => {
      if (a.isVencido && !b.isVencido) return -1;
      if (!a.isVencido && b.isVencido) return 1;
      return a.chequeDueDate.localeCompare(b.chequeDueDate);
    });

    return NextResponse.json({
      cheques,
      total: cheques.length,
      vencidos: cheques.filter((c) => c.isVencido).length,
    });
  } catch (err) {
    console.error('[payments/cheques-pendientes GET]', err);
    return NextResponse.json({ error: 'Error al listar cheques pendientes' }, { status: 500 });
  }
}
