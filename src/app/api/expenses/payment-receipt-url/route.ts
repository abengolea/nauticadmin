/**
 * GET /api/expenses/payment-receipt-url?storagePath=...&schoolId=...
 * Devuelve una URL firmada para ver el comprobante de pago (imagen/PDF) en Storage.
 */

import { NextResponse } from 'next/server';
import { getAdminStorage } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const storagePath = searchParams.get('storagePath');
    const schoolId = searchParams.get('schoolId');

    if (!schoolId?.trim()) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    if (!storagePath?.trim()) {
      return NextResponse.json({ error: 'storagePath es requerido' }, { status: 400 });
    }

    // Validar que el path pertenece a esta escuela
    const expectedPrefix = `schools/${schoolId}/paymentReceipts/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Path de comprobante inválido' }, { status: 403 });
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);

    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json(
        { error: 'Comprobante no encontrado en Storage' },
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
    console.error('[payment-receipt-url]', err);
    return NextResponse.json(
      { error: 'Error al generar URL del comprobante' },
      { status: 500 }
    );
  }
}
