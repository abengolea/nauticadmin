/**
 * GET /api/solicitud-embarcacion/registro?schoolId=X
 * Lista el registro de movimientos (log completo).
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';

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
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 500);

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId requerido' }, { status: 400 });
    }

    const db = getAdminFirestore();
    if (!(await canAccessSchool(db, auth.uid, schoolId))) {
      return NextResponse.json({ error: 'Sin acceso a esta náutica' }, { status: 403 });
    }

    const col = db.collection('schools').doc(schoolId).collection('registroMovimientos');
    const snap = await col.orderBy('createdAt', 'desc').limit(limit).get();

    const items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        tipo: data.tipo,
        solicitudId: data.solicitudId,
        nombreCliente: data.nombreCliente,
        nombreEmbarcacion: data.nombreEmbarcacion,
        operadorNombre: data.operadorNombre,
        operadorEmail: data.operadorEmail,
        createdAt: data.createdAt?.toMillis?.() ?? null,
      };
    });

    return NextResponse.json({ items });
  } catch (e) {
    console.error('[solicitud-embarcacion/registro GET]', e);
    return NextResponse.json({ error: 'Error al listar registro' }, { status: 500 });
  }
}
