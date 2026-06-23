/**
 * GET /api/payments/[paymentId]/comprobante-url?schoolId=...
 * Devuelve URL firmada del comprobante de pago (ej. enviado por WhatsApp).
 * Usa metadata.comprobanteStoragePath.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { COLLECTIONS } from '@/lib/payments/constants';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { paymentId } = await params;
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
    const snap = await db.collection(COLLECTIONS.payments).doc(paymentId).get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }

    const data = snap.data()!;
    if (data.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Pago no pertenece a esta escuela' }, { status: 403 });
    }

    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    const storagePath = metadata.comprobanteStoragePath as string | undefined;
    if (!storagePath?.trim()) {
      return NextResponse.json(
        { error: 'Este cobro no tiene comprobante cargado' },
        { status: 404 }
      );
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
    console.error('[payments comprobante-url]', err);
    return NextResponse.json(
      { error: 'Error al generar URL del comprobante' },
      { status: 500 }
    );
  }
}
