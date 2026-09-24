/**
 * GET /api/payments/[paymentId]/factura-url?schoolId=...
 * Devuelve una URL firmada del PDF de factura (AFIP o carga manual) en Storage.
 * Si el PDF está solo en disco local, lo sube a Storage y lo deja guardado.
 */

import * as fs from 'fs';
import * as path from 'path';
import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { COLLECTIONS } from '@/lib/payments/constants';
import { getFacturasDir } from '@/lib/afip/credentials';
import { buildFacturaPdfFilename } from '@/lib/factura-filename';

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
      return NextResponse.json({ error: 'Sin permisos para esta náutica' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const snap = await db.collection(COLLECTIONS.payments).doc(paymentId).get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }

    const data = snap.data()!;
    if (data.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Pago no pertenece a esta náutica' }, { status: 403 });
    }

    let storagePath =
      typeof data.facturaStoragePath === 'string' ? data.facturaStoragePath.trim() : '';
    const filename =
      path.basename(storagePath) ||
      buildFacturaPdfFilename({
        facturaTipo: typeof data.facturaTipo === 'string' ? data.facturaTipo : undefined,
        facturaPtoVta: typeof data.facturaPtoVta === 'number' ? data.facturaPtoVta : undefined,
        facturaNumero: typeof data.facturaNumero === 'number' ? data.facturaNumero : undefined,
      });

    const storage = getAdminStorage();
    const bucket = storage.bucket();

    if (storagePath) {
      const [exists] = await bucket.file(storagePath).exists();
      if (!exists) storagePath = '';
    }

    if (!storagePath && filename) {
      const localPath = path.join(getFacturasDir(), filename);
      if (fs.existsSync(localPath)) {
        storagePath = `schools/${schoolId}/payments/${paymentId}/${filename}`;
        await bucket.file(storagePath).save(fs.readFileSync(localPath), {
          metadata: { contentType: 'application/pdf' },
        });
        await snap.ref.update({ facturaStoragePath: storagePath });
      }
    }

    if (!storagePath) {
      return NextResponse.json(
        { error: 'Esta factura no tiene PDF guardado' },
        { status: 404 }
      );
    }

    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 60);

    const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
      action: 'read',
      expires,
      responseDisposition: filename
        ? `inline; filename="${filename}"`
        : 'inline',
    });

    return NextResponse.json({ url: signedUrl, filename });
  } catch (err) {
    console.error('[payments factura-url]', err);
    return NextResponse.json(
      { error: 'Error al generar URL de factura' },
      { status: 500 }
    );
  }
}
