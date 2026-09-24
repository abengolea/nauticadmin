/**
 * POST /api/solicitud-embarcacion/reservar
 * Reserva/pedido de lancha desde el portal del cliente.
 * Solo permitido dentro de la ventana de 10 minutos antes de la llegada.
 */

import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken, resolvePlayerLoginFromAuth } from '@/lib/auth-server';
import { getPlayerEmbarcaciones } from '@/lib/utils';
import {
  validateBoatReservationTiming,
  getArrivalForQuickReserve,
} from '@/lib/boat-reservation/validation';
import { BOAT_RESERVATION_WINDOW_MINUTES } from '@/lib/boat-reservation/constants';

type Body = {
  embarcacionId?: string;
  nombreEmbarcacion?: string;
  /** ISO datetime de llegada estimada. Si no se envía, se usa "llego en 10 min". */
  arrivalAt?: string;
  /** true = botón "Llego en 10 minutos" */
  quickReserve?: boolean;
};

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const login = await resolvePlayerLoginFromAuth(auth);
    if (!login) {
      return NextResponse.json({ error: 'No eres un cliente registrado' }, { status: 403 });
    }

    const body = (await request.json()) as Body;
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
    if (playerData.status && playerData.status !== 'active') {
      return NextResponse.json({ error: 'Tu cuenta no está activa. Contactá a la náutica.' }, { status: 403 });
    }

    const embarcaciones = getPlayerEmbarcaciones(playerData);
    if (embarcaciones.length === 0) {
      return NextResponse.json(
        { error: 'No tenés embarcaciones registradas. Completá tu perfil primero.' },
        { status: 400 }
      );
    }

    let nombreEmbarcacion = String(body.nombreEmbarcacion ?? '').trim();
    if (body.embarcacionId) {
      const emb = embarcaciones.find((e) => e.id === body.embarcacionId);
      if (!emb) {
        return NextResponse.json({ error: 'Embarcación no encontrada en tu perfil.' }, { status: 400 });
      }
      nombreEmbarcacion = (emb.nombre ?? emb.matricula ?? '').trim();
    }

    if (!nombreEmbarcacion || nombreEmbarcacion.length < 2) {
      return NextResponse.json({ error: 'Seleccioná una embarcación.' }, { status: 400 });
    }

    const belongsToPlayer = embarcaciones.some((e) => {
      const nom = (e.nombre ?? '').trim().toLowerCase();
      const mat = (e.matricula ?? '').trim().toLowerCase();
      const target = nombreEmbarcacion.toLowerCase();
      return nom === target || mat === target || nom.includes(target) || target.includes(nom);
    });

    if (!belongsToPlayer) {
      return NextResponse.json({ error: 'La embarcación no pertenece a tu perfil.' }, { status: 400 });
    }

    const now = new Date();
    let arrivalAt: Date;
    if (body.quickReserve) {
      arrivalAt = getArrivalForQuickReserve(now);
    } else if (body.arrivalAt) {
      arrivalAt = new Date(body.arrivalAt);
      if (Number.isNaN(arrivalAt.getTime())) {
        return NextResponse.json({ error: 'Horario de llegada inválido.' }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        { error: 'Indicá cuándo llegás o usá "Llego en 10 minutos".' },
        { status: 400 }
      );
    }

    const timing = validateBoatReservationTiming(arrivalAt, now);
    if (!timing.ok) {
      return NextResponse.json({ error: timing.reason }, { status: 400 });
    }

    const col = db.collection('schools').doc(schoolId).collection('solicitudesEmbarcacion');

    const pendingSnap = await col.where('playerId', '==', playerId).limit(20).get();

    const duplicatePending = pendingSnap.docs.some((d) => {
      const data = d.data();
      return (
        data.status === 'pendiente' &&
        String(data.nombreEmbarcacion ?? '').trim().toLowerCase() === nombreEmbarcacion.toLowerCase()
      );
    });

    if (duplicatePending) {
      return NextResponse.json(
        { error: 'Ya tenés un pedido pendiente para esta embarcación.' },
        { status: 409 }
      );
    }

    const nombreCliente = `${playerData.firstName ?? ''} ${playerData.lastName ?? ''}`.trim() || 'Cliente';

    const docRef = await col.add({
      nombreCliente,
      nombreEmbarcacion,
      playerId,
      status: 'pendiente',
      source: 'portal',
      arrivalAt: Timestamp.fromDate(arrivalAt),
      createdAt: Timestamp.now(),
    });

    await db.collection('schools').doc(schoolId).collection('registroMovimientos').add({
      tipo: 'solicitud_creada',
      solicitudId: docRef.id,
      nombreCliente,
      nombreEmbarcacion,
      playerId,
      source: 'portal',
      arrivalAt: Timestamp.fromDate(arrivalAt),
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      id: docRef.id,
      message: 'Pedido enviado. El operador preparará tu embarcación.',
      arrivalAt: arrivalAt.toISOString(),
      windowMinutes: BOAT_RESERVATION_WINDOW_MINUTES,
    });
  } catch (e) {
    console.error('[solicitud-embarcacion/reservar POST]', e);
    return NextResponse.json({ error: 'No se pudo enviar el pedido. Intentá de nuevo.' }, { status: 500 });
  }
}
