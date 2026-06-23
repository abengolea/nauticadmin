/**
 * GET /api/payments/[paymentId]/documento-adjunto-url?schoolId=...
 * URL firmada para ver el PDF adjunto opcional del cobro.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { verifyIdToken, isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
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

    const storagePath = data.documentoAdjuntoStoragePath as string | undefined;
    if (!storagePath?.trim()) {
      return NextResponse.json({ error: 'Este cobro no tiene documento adjunto' }, { status: 404 });
    }

    const file = getAdminStorage().bucket().file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: 'Archivo no encontrado en Storage' }, { status: 404 });
    }

    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 60);
    const [url] = await file.getSignedUrl({ action: 'read', expires });

    return NextResponse.json({
      url,
      nombre: (data.documentoAdjuntoNombre as string) ?? 'documento.pdf',
      descripcion: (data.documentoAdjuntoDescripcion as string) ?? null,
    });
  } catch (err) {
    console.error('[payments/documento-adjunto-url]', err);
    return NextResponse.json({ error: 'Error al generar URL' }, { status: 500 });
  }
}
