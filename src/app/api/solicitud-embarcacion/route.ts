/**
 * POST /api/solicitud-embarcacion
 * Crea una solicitud de embarcación sin autenticación.
 * GET /api/solicitud-embarcacion?schoolId=X&status=pendiente|salió
 * Lista solicitudes (pendientes o salieron sin regreso).
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { verifyIdToken } from '@/lib/auth-server';

type Body = {
  nombreCliente: string;
  nombreEmbarcacion: string;
  schoolId?: string;
};

async function addRegistroMovimiento(
  db: Awaited<ReturnType<typeof getAdminFirestore>>,
  schoolId: string,
  tipo: 'solicitud_creada' | 'tomada' | 'regreso',
  data: {
    solicitudId: string;
    nombreCliente: string;
    nombreEmbarcacion: string;
    operadorId?: string;
    operadorNombre?: string;
    operadorEmail?: string;
  }
) {
  const col = db.collection('schools').doc(schoolId).collection('registroMovimientos');
  await col.add({
    tipo,
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const nombreCliente = String(body?.nombreCliente ?? '').trim();
    const nombreEmbarcacion = String(body?.nombreEmbarcacion ?? '').trim();
    const schoolId = body?.schoolId ? String(body.schoolId).trim() : undefined;

    if (!nombreCliente || nombreCliente.length < 2) {
      return NextResponse.json(
        { error: 'El nombre debe tener al menos 2 caracteres.' },
        { status: 400 }
      );
    }
    if (!nombreEmbarcacion || nombreEmbarcacion.length < 2) {
      return NextResponse.json(
        { error: 'La embarcación debe tener al menos 2 caracteres.' },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();

    let targetSchoolId = schoolId;
    if (!targetSchoolId) {
      const schoolsSnap = await db
        .collection('schools')
        .where('status', '==', 'active')
        .limit(1)
        .get();
      if (schoolsSnap.empty) {
        return NextResponse.json(
          { error: 'No hay ninguna náutica configurada.' },
          { status: 400 }
        );
      }
      targetSchoolId = schoolsSnap.docs[0].id;
    }

    const col = db
      .collection('schools')
      .doc(targetSchoolId)
      .collection('solicitudesEmbarcacion');

    const docRef = await col.add({
      nombreCliente,
      nombreEmbarcacion,
      status: 'pendiente',
      createdAt: Timestamp.now(),
    });

    await addRegistroMovimiento(db, targetSchoolId, 'solicitud_creada', {
      solicitudId: docRef.id,
      nombreCliente,
      nombreEmbarcacion,
    });

    return NextResponse.json({
      id: docRef.id,
      message: 'Solicitud enviada correctamente.',
    });
  } catch (e) {
    console.error('[solicitud-embarcacion]', e);
    return NextResponse.json(
      { error: 'No se pudo guardar la solicitud. Intentá de nuevo.' },
      { status: 500 }
    );
  }
}

async function canAccessSchool(db: Awaited<ReturnType<typeof getAdminFirestore>>, uid: string, schoolId: string): Promise<boolean> {
  const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${uid}`).get();
  const role = (schoolUserSnap.data() as { role?: string })?.role;
  if (['school_admin', 'editor'].includes(role ?? '')) return true;
  const platformSnap = await db.doc(`platformUsers/${uid}`).get();
  return (platformSnap.data() as { super_admin?: boolean })?.super_admin === true;
}

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const status = searchParams.get('status'); // pendiente | salió
    const enriquecer = searchParams.get('enriquecer') === '1';

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId requerido' }, { status: 400 });
    }

    const db = getAdminFirestore();
    if (!(await canAccessSchool(db, auth.uid, schoolId))) {
      return NextResponse.json({ error: 'Sin acceso a esta náutica' }, { status: 403 });
    }
    const col = db.collection('schools').doc(schoolId).collection('solicitudesEmbarcacion');

    if (status !== 'pendiente' && status !== 'salió') {
      return NextResponse.json({ error: 'status debe ser pendiente o salió' }, { status: 400 });
    }

    const snap = await col.where('status', '==', status).limit(100).get();
    let items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        nombreCliente: data.nombreCliente,
        nombreEmbarcacion: data.nombreEmbarcacion,
        status: data.status,
        createdAt: data.createdAt?.toMillis?.() ?? null,
        salioAt: data.salioAt?.toMillis?.() ?? null,
        regresoAt: data.regresoAt?.toMillis?.() ?? null,
        salioOperadorNombre: data.salioOperadorNombre,
        regresoOperadorNombre: data.regresoOperadorNombre,
      };
    });

    if (status === 'pendiente') {
      items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    } else {
      items.sort((a, b) => (b.salioAt ?? 0) - (a.salioAt ?? 0));
    }

    if (enriquecer && items.length > 0) {
      const playersSnap = await db.collection('schools').doc(schoolId).collection('players').get();
      const players = playersSnap.docs.map((d) => {
        const data = d.data() as {
          firstName?: string;
          lastName?: string;
          embarcacionNombre?: string;
          embarcacionMatricula?: string;
          embarcaciones?: Array<{ nombre?: string; matricula?: string }>;
          ubicacion?: string;
          photoUrl?: string;
        };
        const embs = data.embarcaciones?.length
          ? data.embarcaciones.flatMap((e) => [(e.nombre ?? '').trim(), (e.matricula ?? '').trim()].filter(Boolean))
          : [(data.embarcacionNombre ?? '').trim(), (data.embarcacionMatricula ?? '').trim()].filter(Boolean);
        return { id: d.id, ...data, _embarcacionesNorm: embs };
      });
      const norm = (s: string) => (s ?? '').trim().toLowerCase();
      items = items.map((item) => {
        const nombreNorm = norm(item.nombreCliente);
        const embNorm = norm(item.nombreEmbarcacion);
        const player = players.find((p) => {
          const pNombre = norm(`${(p.firstName ?? '').trim()} ${(p.lastName ?? '').trim()}`);
          const pEmbs = (p as { _embarcacionesNorm?: string[] })._embarcacionesNorm ?? [];
          const nombreMatch = pNombre === nombreNorm || (nombreNorm && pNombre.includes(nombreNorm)) || (pNombre && nombreNorm.includes(pNombre));
          const embMatch = !embNorm || pEmbs.some((pe) => pe && (norm(pe) === embNorm || embNorm.includes(norm(pe)) || norm(pe).includes(embNorm)));
          return nombreMatch && embMatch;
        });
        return {
          ...item,
          ubicacion: player?.ubicacion ?? null,
          photoUrl: player?.photoUrl ?? null,
        };
      });
    }

    return NextResponse.json({ items });
  } catch (e) {
    console.error('[solicitud-embarcacion GET]', e);
    return NextResponse.json({ error: 'Error al listar' }, { status: 500 });
  }
}
