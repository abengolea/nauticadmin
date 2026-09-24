/**
 * GET /api/clients/accounts/me
 * Cuenta corriente del cliente autenticado (solo lectura).
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken, resolvePlayerLoginFromAuth } from '@/lib/auth-server';
import { getClientAccountWithBalance } from '@/lib/client-accounts/db';

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const login = await resolvePlayerLoginFromAuth(auth);
    if (!login) {
      return NextResponse.json({ error: 'No eres un cliente registrado' }, { status: 403 });
    }

    const { schoolId, playerId } = login;
    const db = getAdminFirestore();

    const playerSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('players')
      .doc(playerId)
      .get();

    if (!playerSnap.exists) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    const playerData = playerSnap.data()!;
    const { entries, balance } = await getClientAccountWithBalance(db, schoolId, playerId);

    const playerName = `${playerData.firstName ?? ''} ${playerData.lastName ?? ''}`.trim() || playerId;

    return NextResponse.json({
      playerId,
      schoolId,
      playerName,
      creditoActivo: playerData.creditoActivo !== false,
      entries,
      balance,
    });
  } catch (err) {
    console.error('[clients/accounts/me GET]', err);
    return NextResponse.json({ error: 'Error al obtener cuenta corriente' }, { status: 500 });
  }
}
