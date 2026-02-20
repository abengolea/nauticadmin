/**
 * GET /api/expenses/[id]?schoolId=...
 * Obtiene un gasto por ID.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import type { Expense } from '@/lib/expenses/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;
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
    const snap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('expenses')
      .doc(id)
      .get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    }

    const expense = { id: snap.id, ...snap.data() } as Expense;
    return NextResponse.json(expense);
  } catch (err) {
    console.error('[expenses GET id]', err);
    return NextResponse.json({ error: 'Error al obtener gasto' }, { status: 500 });
  }
}
