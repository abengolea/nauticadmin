/**
 * POST /api/duplicate-cases/[caseId]/resolve
 * Resuelve un caso de duplicado con la acción elegida.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { getDuplicateCase } from '@/lib/duplicate-payments/duplicate-case-db';
import { createInvoiceOrdersFromResolution } from '@/lib/duplicate-payments/invoice-order';
import { z } from 'zod';
import type { DuplicateResolutionType } from '@/lib/duplicate-payments/types';

const resolveSchema = z.object({
  schoolId: z.string().min(1),
  type: z.enum([
    'invoice_one_credit_rest',
    'invoice_all',
    'refund_one',
    'ignore_duplicates',
  ]),
  chosenPaymentIds: z.array(z.string()).min(1),
  notes: z.string().optional().default(''),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { caseId } = await params;
    const body = await request.json();
    const parsed = resolveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { schoolId, type, chosenPaymentIds, notes } = parsed.data;

    const db = getAdminFirestore();

    const schoolUserSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('users')
      .doc(auth.uid)
      .get();

    if (!schoolUserSnap.exists) {
      return NextResponse.json({ error: 'Sin acceso a esta escuela' }, { status: 403 });
    }

    const role = schoolUserSnap.data()?.role;
    if (role !== 'school_admin' && role !== 'coach') {
      return NextResponse.json(
        { error: 'Solo admin o entrenador puede resolver duplicados' },
        { status: 403 }
      );
    }

    const duplicateCase = await getDuplicateCase(db, caseId);
    if (!duplicateCase) {
      return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 });
    }

    if (duplicateCase.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Caso no pertenece a esta escuela' }, { status: 403 });
    }

    if (duplicateCase.status !== 'open') {
      return NextResponse.json({ error: 'El caso ya fue resuelto' }, { status: 400 });
    }

    // Validar que chosenPaymentIds estén en el caso
    const validIds = new Set(duplicateCase.paymentIds);
    for (const id of chosenPaymentIds) {
      if (!validIds.has(id)) {
        return NextResponse.json(
          { error: `El pago ${id} no pertenece a este caso` },
          { status: 400 }
        );
      }
    }

    const resolution = {
      type: type as DuplicateResolutionType,
      chosenPaymentIds,
      notes,
      resolvedBy: auth.uid,
      resolvedAt: new Date().toISOString(),
    };

    const { invoiceOrderIds, creditId } = await createInvoiceOrdersFromResolution(
      db,
      duplicateCase,
      resolution
    );

    // Audit log
    await db.collection('auditLog').add({
      userId: auth.uid,
      userEmail: auth.email ?? '',
      action: 'duplicate_case_resolved',
      resourceType: 'duplicate_case',
      resourceId: caseId,
      schoolId,
      details: JSON.stringify({
        resolutionType: type,
        chosenPaymentIds,
        invoiceOrderIds,
        creditId,
      }),
      createdAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      invoiceOrderIds,
      creditId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/duplicate-cases/[caseId]/resolve]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
