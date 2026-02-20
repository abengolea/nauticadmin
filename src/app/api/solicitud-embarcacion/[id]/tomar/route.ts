/**
 * PATCH /api/solicitud-embarcacion/[id]/tomar
 * Operador toma la solicitud = va a buscar la embarcación.
 * Cambia status a "salió" y registra en movimiento.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { verifyIdToken } from '@/lib/auth-server';

async function canAccessSchool(db: Awaited<ReturnType<typeof getAdminFirestore>>, uid: string, schoolId: string): Promise<boolean> {
  const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${uid}`).get();
  const role = (schoolUserSnap.data() as { role?: string })?.role;
  if (['school_admin', 'editor'].includes(role ?? '')) return true;
  const platformSnap = await db.doc(`platformUsers/${uid}`).get();
  return (platformSnap.data() as { super_admin?: boolean })?.super_admin === true;
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyIdToken(_request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'id requerido' }, { status: 400 });
    }

    const body = (await _request.json().catch(() => ({}))) as { schoolId?: string };
    const schoolId = body?.schoolId?.trim();

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId requerido' }, { status: 400 });
    }

    const db = getAdminFirestore();
    if (!(await canAccessSchool(db, auth.uid, schoolId))) {
      return NextResponse.json({ error: 'Sin acceso a esta náutica' }, { status: 403 });
    }

    const solicitudRef = db.doc(`schools/${schoolId}/solicitudesEmbarcacion/${id}`);
    const solicitudSnap = await solicitudRef.get();
    if (!solicitudSnap.exists) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    const data = solicitudSnap.data() as { status?: string; nombreCliente?: string; nombreEmbarcacion?: string };
    if (data.status !== 'pendiente') {
      return NextResponse.json({ error: 'La solicitud ya fue tomada' }, { status: 400 });
    }

    const operadorNombre = auth.displayName ?? auth.email ?? auth.uid;
    const now = Timestamp.now();

    await solicitudRef.update({
      status: 'salió',
      salioAt: now,
      salioOperadorId: auth.uid,
      salioOperadorNombre: operadorNombre,
    });

    await db.collection('schools').doc(schoolId).collection('registroMovimientos').add({
      tipo: 'tomada',
      solicitudId: id,
      nombreCliente: data.nombreCliente ?? '',
      nombreEmbarcacion: data.nombreEmbarcacion ?? '',
      operadorId: auth.uid,
      operadorNombre,
      operadorEmail: auth.email ?? undefined,
      createdAt: now,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[solicitud-embarcacion/tomar]', e);
    return NextResponse.json({ error: 'Error al tomar solicitud' }, { status: 500 });
  }
}
