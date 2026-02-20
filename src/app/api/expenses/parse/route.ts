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

export async function POST(request: Request) {
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
        { error: 'Imagen no encontrada en Storage' },
        { status: 404 }
      );
    }

    const [buffer] = await file.download();
    const base64 = buffer.toString('base64');
    const contentType = (await file.getMetadata())[0]?.contentType || 'image/jpeg';

    const result = await parseExpenseFromImage(base64, contentType);

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

    const updateData: Partial<Expense> = {
      supplier: result.extracted.supplier,
      invoice: result.extracted.invoice,
      amounts: result.extracted.amounts,
      items: result.extracted.items,
      ai: aiData,
      validations,
      updatedAt: new Date().toISOString(),
    };

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
