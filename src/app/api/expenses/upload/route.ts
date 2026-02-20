/**
 * POST /api/expenses/upload
 * Sube imagen a Storage, crea expense draft y retorna expenseId + storagePath.
 * El cliente debe subir la imagen a Storage primero (con signed URL o direct upload)
 * y luego llamar a este endpoint con el path, O enviar la imagen en base64 para que
 * el servidor la suba (evita exponer reglas de Storage al cliente).
 *
 * Flujo: cliente captura foto -> POST con FormData (file) -> servidor sube a Storage -> crea draft
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import type { Expense } from '@/lib/expenses/types';

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const schoolId = formData.get('schoolId') as string | null;

    if (!schoolId?.trim()) {
      return NextResponse.json(
        { error: 'schoolId es requerido' },
        { status: 400 }
      );
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const storage = getAdminStorage();
    const bucket = storage.bucket();

    if (file && file.size > 0) {
      const expenseRef = db.collection('schools').doc(schoolId).collection('expenses').doc();
      const expenseId = expenseRef.id;

      const ext = file.name.split('.').pop() || 'jpg';
      const basePath = `schools/${schoolId}/expenses/${expenseId}`;
      const storagePath = `${basePath}/original.${ext}`;
      const thumbnailPath = `${basePath}/thumb.${ext}`;

      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const originalFile = bucket.file(storagePath);
      await originalFile.save(fileBuffer, {
        metadata: { contentType: file.type || 'image/jpeg' },
      });

      // Thumbnail: por simplicidad guardamos la misma imagen (en producción usar sharp/jimp para redimensionar)
      const thumbFile = bucket.file(thumbnailPath);
      await thumbFile.save(fileBuffer, {
        metadata: { contentType: file.type || 'image/jpeg' },
      });

      const now = new Date().toISOString();
      const draft: Omit<Expense, 'id'> & { id: string } = {
        id: expenseId,
        schoolId,
        createdBy: auth.uid,
        createdAt: now,
        source: { storagePath, thumbnailPath },
        status: 'draft',
        supplier: {},
        invoice: {},
        amounts: { currency: 'ARS', total: 0 },
      };

      await expenseRef.set(draft);

      return NextResponse.json({
        expenseId,
        storagePath,
        thumbnailPath,
      });
    }

    return NextResponse.json(
      { error: 'Se requiere un archivo de imagen (file)' },
      { status: 400 }
    );
  } catch (err) {
    console.error('[expenses/upload]', err);
    return NextResponse.json(
      { error: 'Error al subir el gasto' },
      { status: 500 }
    );
  }
}
