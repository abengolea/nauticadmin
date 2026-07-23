/**
 * GET /api/expenses/payment-receipt-url?storagePath=...&schoolId=...
 * Devuelve el comprobante de pago (imagen/PDF) autenticado.
 * Preferimos stream del archivo (más fiable en App Hosting que signed URLs).
 * Con ?format=json intenta URL firmada (compat).
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
    const format = searchParams.get('format');

    if (!schoolId?.trim()) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    if (!storagePath?.trim()) {
      return NextResponse.json({ error: 'storagePath es requerido' }, { status: 400 });
    }

    const expectedPrefix = `schools/${schoolId}/paymentReceipts/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Path de comprobante inválido' }, { status: 403 });
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta náutica' }, { status: 403 });
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

    if (format === 'json') {
      try {
        const expires = new Date();
        expires.setMinutes(expires.getMinutes() + 60);
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires,
        });
        return NextResponse.json({ url: signedUrl });
      } catch (signErr) {
        console.error('[payment-receipt-url] signed URL failed:', signErr);
        return NextResponse.json(
          {
            error:
              'No se pudo firmar la URL del comprobante. Probá de nuevo o contactá soporte.',
          },
          { status: 500 }
        );
      }
    }

    const [meta] = await file.getMetadata();
    const contentType =
      (meta.contentType as string | undefined) ||
      (storagePath.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : 'image/jpeg');

    const [buffer] = await file.download();
    const filename = storagePath.split('/').pop() || 'comprobante';

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (err) {
    console.error('[payment-receipt-url]', err);
    const message =
      err instanceof Error ? err.message : 'Error al obtener el comprobante';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
