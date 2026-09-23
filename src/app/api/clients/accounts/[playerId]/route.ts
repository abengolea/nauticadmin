/**
 * GET /api/clients/accounts/[playerId]?schoolId=...
 * Obtiene la cuenta corriente contable de un cliente (entries + saldo).
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken, isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { getClientAccountWithBalance } from '@/lib/client-accounts/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { playerId } = await params;
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');

    if (!schoolId?.trim()) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta náutica' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const { entries, balance } = await getClientAccountWithBalance(db, schoolId, playerId);

    const playerSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('players')
      .doc(playerId)
      .get();

    const playerData = playerSnap.exists ? playerSnap.data() : null;
    const playerName = playerData
      ? `${playerData.firstName ?? ''} ${playerData.lastName ?? ''}`.trim()
      : playerId;

    return NextResponse.json({
      playerId,
      playerName,
      creditoActivo: playerData?.creditoActivo !== false,
      entries,
      balance,
    });
  } catch (err) {
    console.error('[clients/accounts GET]', err);
    return NextResponse.json({ error: 'Error al obtener cuenta corriente' }, { status: 500 });
  }
}
