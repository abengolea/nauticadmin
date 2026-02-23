/**
 * GET /api/duplicate-cases?schoolId=xxx
 * Lista casos de duplicado abiertos para la escuela.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { listOpenDuplicateCases } from '@/lib/duplicate-payments/duplicate-case-db';

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const url = new URL(request.url);
    const schoolId = url.searchParams.get('schoolId');
    if (!schoolId || schoolId.trim() === '') {
      return NextResponse.json({ error: 'schoolId requerido' }, { status: 400 });
    }

    // Verificar que el usuario tenga acceso a la escuela
    const db = getAdminFirestore();
    const schoolUserSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('users')
      .doc(auth.uid)
      .get();

    if (!schoolUserSnap.exists) {
      return NextResponse.json({ error: 'Sin acceso a esta escuela' }, { status: 403 });
    }

    const cases = await listOpenDuplicateCases(db, schoolId);
    return NextResponse.json({ cases });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/duplicate-cases]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
