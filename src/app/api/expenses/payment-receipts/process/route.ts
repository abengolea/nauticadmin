/**
 * POST /api/expenses/payment-receipts/process
 * FormData: file, schoolId, vendorId
 * Sube el comprobante a Storage y extrae datos con IA (cheque, transferencia, cupón).
 * Retorna: { storagePath, extracted }
 */

import { NextResponse } from 'next/server';
import { getAdminStorage } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { parsePaymentReceiptFromImage } from '@/ai/flows/parse-payment-receipt';

const MAX_IMAGE_DIMENSION = 1280;

async function resizeImageIfNeeded(
  buffer: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string }> {
  if (!contentType.startsWith('image/')) return { buffer, contentType };
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buffer).metadata();
    const { width = 0, height = 0 } = meta;
    if (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION) {
      return { buffer, contentType };
    }
    const resized = await sharp(buffer)
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, { fit: 'inside' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { buffer: resized, contentType: 'image/jpeg' };
  } catch {
    return { buffer, contentType };
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const schoolId = formData.get('schoolId') as string | null;
    const vendorId = formData.get('vendorId') as string | null;

    if (!schoolId?.trim()) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: 'Se requiere un archivo (imagen JPG/PNG/WebP o PDF)' },
        { status: 400 }
      );
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const isPdf = file.type === 'application/pdf' || ext === 'pdf';
    if (!isPdf && !file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Solo se permiten imágenes (JPG, PNG, WebP) o PDF' },
        { status: 400 }
      );
    }

    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const receiptId = crypto.randomUUID();
    const basePath = `schools/${schoolId}/paymentReceipts/${receiptId}`;
    const storagePath = `${basePath}/original.${ext}`;

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || (isPdf ? 'application/pdf' : 'image/jpeg');

    const storageFile = bucket.file(storagePath);
    await storageFile.save(fileBuffer, { metadata: { contentType } });

    // Parse con IA (solo imágenes por ahora; PDF requiere conversión)
    let extracted;
    try {
      const { buffer: finalBuffer, contentType: finalContentType } = await resizeImageIfNeeded(
        fileBuffer,
        contentType
      );
      const base64 = finalBuffer.toString('base64');
      const result = await parsePaymentReceiptFromImage(base64, finalContentType);
      extracted = result.extracted;
    } catch (parseErr) {
      console.error('[payment-receipts/process] Parse error:', parseErr);
      return NextResponse.json({
        storagePath,
        extracted: null,
        parseError: parseErr instanceof Error ? parseErr.message : 'Error al extraer datos con IA',
      });
    }

    return NextResponse.json({ storagePath, extracted });
  } catch (err) {
    console.error('[payment-receipts/process]', err);
    return NextResponse.json(
      { error: 'Error al procesar comprobante' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
