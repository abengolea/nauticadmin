/**
 * GET /api/payments/player-unpaid?schoolId=...&playerId=...
 * Devuelve las cuotas adeudadas de un jugador, ordenadas de la más vieja a la más nueva.
 * Usado para el selector de imputación en pagos manuales.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getUnpaidPeriodsForPlayer } from '@/lib/payments/db';
import { verifyIdToken } from '@/lib/auth-server';

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const playerId = searchParams.get('playerId');

    if (!schoolId || !playerId) {
      return NextResponse.json(
        { error: 'schoolId y playerId son requeridos' },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const unpaid = await getUnpaidPeriodsForPlayer(db, schoolId, playerId);

    return NextResponse.json({ unpaid });
  } catch (e) {
    console.error('[payments/player-unpaid]', e);
    return NextResponse.json(
      { error: 'Error al obtener cuotas adeudadas' },
      { status: 500 }
    );
  }
}
