/**
 * POST /api/payments/[paymentId]/documento-adjunto
 * Sube un PDF opcional asociado al cobro (remito, nota, etc.), independiente de la factura.
 *
 * FormData: schoolId, file (PDF), descripcion? (opcional)
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { verifyIdToken, isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { COLLECTIONS } from '@/lib/payments/constants';
import { z } from 'zod';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const fieldsSchema = z.object({
  schoolId: z.string().min(1),
  descripcion: z.string().max(200).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { paymentId } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const schoolId = formData.get('schoolId') as string | null;
    const descripcion = formData.get('descripcion') as string | null;

    const parsed = fieldsSchema.safeParse({
      schoolId: schoolId ?? '',
      descripcion: descripcion?.trim() || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    const { schoolId: sid, descripcion: desc } = parsed.data;

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, sid);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'Seleccioná un archivo PDF' }, { status: 400 });
    }

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return NextResponse.json({ error: 'Solo se permiten archivos PDF' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'El archivo no puede superar 10MB' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const paymentRef = db.collection(COLLECTIONS.payments).doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }
    const paymentData = paymentSnap.data()!;
    if (paymentData.schoolId !== sid) {
      return NextResponse.json({ error: 'Pago no pertenece a esta escuela' }, { status: 403 });
    }

    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const storagePath = `schools/${sid}/payments/${paymentId}/documento-adjunto.pdf`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await bucket.file(storagePath).save(buffer, {
      metadata: { contentType: 'application/pdf' },
    });

    const now = new Date();
    await paymentRef.update({
      documentoAdjuntoStoragePath: storagePath,
      documentoAdjuntoNombre: file.name.slice(0, 200),
      documentoAdjuntoDescripcion: desc ?? null,
      documentoAdjuntoAt: now,
    });

    return NextResponse.json({
      ok: true,
      storagePath,
      nombre: file.name,
    });
  } catch (err) {
    console.error('[payments/documento-adjunto POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al subir documento' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const paymentRef = db.collection(COLLECTIONS.payments).doc(paymentId);
    const snap = await paymentRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }
    const data = snap.data()!;
    if (data.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Pago no pertenece a esta escuela' }, { status: 403 });
    }

    const storagePath = data.documentoAdjuntoStoragePath as string | undefined;
    if (storagePath) {
      try {
        await getAdminStorage().bucket().file(storagePath).delete({ ignoreNotFound: true });
      } catch {
        /* ignorar */
      }
    }

    await paymentRef.update({
      documentoAdjuntoStoragePath: null,
      documentoAdjuntoNombre: null,
      documentoAdjuntoDescripcion: null,
      documentoAdjuntoAt: null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[payments/documento-adjunto DELETE]', err);
    return NextResponse.json({ error: 'Error al quitar documento' }, { status: 500 });
  }
}
