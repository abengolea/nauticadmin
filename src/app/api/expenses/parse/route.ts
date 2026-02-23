/**
 * POST /api/expenses/parse
 * Recibe expenseId + schoolId + storagePath, descarga la imagen de Storage,
 * la envía a IA (Gemini Vision) y devuelve JSON extraído.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { parseExpenseFromImage } from '@/ai/flows/parse-expense-invoice';
import { parseExpenseRequestSchema } from '@/lib/expenses/schemas';
import {
  validateTotalMatches,
  validateIvaMatches,
  validateCuit,
  findDuplicateCandidates,
} from '@/lib/expenses/utils';
import type { Expense, ExpenseAI, ExpenseValidations } from '@/lib/expenses/types';

const MAX_IMAGE_DIMENSION = 1280; // Para facturas, 1280px es suficiente y reduce tokens/latencia

/** Redimensiona imagen para reducir tokens enviados a Gemini. Solo para imágenes. */
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

/** Elimina valores undefined recursivamente. Firestore no acepta undefined. */
function removeUndefined<T>(val: T): T {
  if (val === undefined) return val;
  if (Array.isArray(val)) {
    return val.map((v) => removeUndefined(v)) as T;
  }
  if (val !== null && typeof val === 'object') {
    const result = {} as Record<string, unknown>;
    for (const [key, v] of Object.entries(val)) {
      if (v === undefined) continue;
      result[key] = removeUndefined(v);
    }
    return result as T;
  }
  return val;
}

export async function POST(request: Request) {
  console.log('[expenses/parse] Request received');
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = parseExpenseRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { expenseId, schoolId, storagePath } = parsed.data;

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);

    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json(
        { error: 'Archivo no encontrado en Storage' },
        { status: 404 }
      );
    }

    const [buffer] = await file.download();
    const contentType = (await file.getMetadata())[0]?.contentType || 'image/jpeg';
    const { buffer: finalBuffer, contentType: finalContentType } = await resizeImageIfNeeded(
      buffer,
      contentType
    );
    const base64 = finalBuffer.toString('base64');
    console.log('[expenses/parse] File ready, calling IA...', {
      contentType: finalContentType,
      size: finalBuffer.length,
    });

    const result = await parseExpenseFromImage(base64, finalContentType);
    console.log('[expenses/parse] IA extraction done');

    const validations: ExpenseValidations = {
      totalMatches: validateTotalMatches(result.extracted.amounts),
      ivaMatches: validateIvaMatches(result.extracted.amounts),
      cuitValid: result.extracted.supplier?.cuit
        ? validateCuit(result.extracted.supplier.cuit)
        : undefined,
    };

    const duplicateCandidates = await findDuplicateCandidates(
      db,
      schoolId,
      {
        supplier: result.extracted.supplier,
        invoice: result.extracted.invoice,
        amounts: result.extracted.amounts,
      },
      expenseId
    );
    if (duplicateCandidates.length > 0) {
      validations.duplicateCandidate = true;
    }

    const aiData: ExpenseAI = {
      provider: 'google',
      model: result.model,
      confidence: result.confidence,
      rawText: result.rawText,
      extractedAt: new Date().toISOString(),
    };

    const updateData = removeUndefined({
      supplier: result.extracted.supplier,
      invoice: result.extracted.invoice,
      amounts: result.extracted.amounts,
      items: result.extracted.items,
      notes: result.extracted.concept,
      ai: aiData,
      validations,
      updatedAt: new Date().toISOString(),
    }) as Partial<Expense>;

    await db
      .collection('schools')
      .doc(schoolId)
      .collection('expenses')
      .doc(expenseId)
      .update(updateData);

    return NextResponse.json({
      extracted: result.extracted,
      confidence: result.confidence,
      validations,
      duplicateCandidates,
    });
  } catch (err) {
    console.error('[expenses/parse]', err);
    const message = err instanceof Error ? err.message : 'Error al parsear la factura';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 60;
