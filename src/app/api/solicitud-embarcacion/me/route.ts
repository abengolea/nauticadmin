/**
 * GET /api/solicitud-embarcacion/me
 * Solicitudes de embarcación del cliente autenticado.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken, resolvePlayerLoginFromAuth } from '@/lib/auth-server';

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
    const col = db.collection('schools').doc(schoolId).collection('solicitudesEmbarcacion');

    const snap = await col.where('playerId', '==', playerId).limit(50).get();

    const mapDoc = (d: (typeof snap.docs)[number]) => {
      const data = d.data();
      return {
        id: d.id,
        nombreEmbarcacion: data.nombreEmbarcacion,
        status: data.status,
        createdAt: data.createdAt?.toMillis?.() ?? null,
        arrivalAt: data.arrivalAt?.toMillis?.() ?? null,
        salioAt: data.salioAt?.toMillis?.() ?? null,
        regresoAt: data.regresoAt?.toMillis?.() ?? null,
        source: data.source ?? 'kiosk',
      };
    };

    const all = snap.docs.map(mapDoc).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const active = all.filter((r) => r.status === 'pendiente' || r.status === 'salió');
    const activeIds = new Set(active.map((r) => r.id));
    const history = all.filter((r) => !activeIds.has(r.id));

    return NextResponse.json({ active, history });
  } catch (e) {
    console.error('[solicitud-embarcacion/me GET]', e);
    return NextResponse.json({ error: 'Error al listar solicitudes' }, { status: 500 });
  }
}
