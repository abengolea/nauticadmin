/**
 * GET /api/expenses/[id]/invoice-url?schoolId=...
 * Devuelve una URL firmada para ver la factura (foto o PDF) en Storage.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
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
    const storagePath = expense.source?.storagePath;

    if (!storagePath?.trim()) {
      return NextResponse.json(
        { error: 'Este gasto no tiene factura asociada' },
        { status: 404 }
      );
    }

    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);

    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json(
        { error: 'Archivo de factura no encontrado en Storage' },
        { status: 404 }
      );
    }

    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 60);

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires,
    });

    return NextResponse.json({ url: signedUrl });
  } catch (err) {
    console.error('[expenses invoice-url]', err);
    return NextResponse.json(
      { error: 'Error al generar URL de factura' },
      { status: 500 }
    );
  }
}
