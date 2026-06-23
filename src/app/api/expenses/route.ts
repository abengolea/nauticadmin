/**
 * GET /api/expenses?schoolId=...&status=...&vendorId=...&categoryId=...&limit=...&offset=...
 * Lista gastos con filtros.
 *
 * PATCH /api/expenses (body: expenseId, schoolId, updates)
 * Actualiza un gasto (confirmar, editar, etc.)
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { confirmExpenseSchema } from '@/lib/expenses/schemas';
import type { Expense, VendorAccountEntry } from '@/lib/expenses/types';

const listSchema = {
  schoolId: (v: string | null) => (v?.trim() ? v : ''),
  status: (v: string | null) =>
    ['draft', 'confirmed', 'paid', 'cancelled'].includes(v || '') ? v! : undefined,
  vendorId: (v: string | null) => (v?.trim() ? v : undefined),
  categoryId: (v: string | null) => (v?.trim() ? v : undefined),
  limit: (v: string | null) => (v ? parseInt(v, 10) : 50),
  offset: (v: string | null) => (v ? parseInt(v, 10) : 0),
};

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = listSchema.schoolId(searchParams.get('schoolId'));
    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const status = listSchema.status(searchParams.get('status'));
    const vendorId = listSchema.vendorId(searchParams.get('vendorId'));
    const categoryId = listSchema.categoryId(searchParams.get('categoryId'));
    const limit = Math.min(listSchema.limit(searchParams.get('limit')) || 50, 100);
    const offset = listSchema.offset(searchParams.get('offset')) || 0;

    const db = getAdminFirestore();
    let query = db
      .collection('schools')
      .doc(schoolId)
      .collection('expenses')
      .orderBy('createdAt', 'desc');

    if (status) query = query.where('status', '==', status);
    if (vendorId) query = query.where('supplier.vendorId', '==', vendorId);
    if (categoryId) query = query.where('categoryId', '==', categoryId);

    const snap = await query.limit(limit + 1).offset(offset).get();
    const expenses = snap.docs.slice(0, limit).map((d) => ({ id: d.id, ...d.data() } as Expense));
    const hasMore = snap.docs.length > limit;

    return NextResponse.json({ expenses, hasMore });
  } catch (err) {
    console.error('[expenses GET]', err);
    return NextResponse.json({ error: 'Error al listar gastos' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = confirmExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { expenseId, schoolId, updates } = parsed.data;

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const expenseRef = db
      .collection('schools')
      .doc(schoolId)
      .collection('expenses')
      .doc(expenseId);

    const expenseSnap = await expenseRef.get();
    if (!expenseSnap.exists) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    }

    const expense = expenseSnap.data() as Expense;
    const isConfirming = expense.status === 'draft';

    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (updates) {
      if (updates.supplier) updateData.supplier = { ...expense.supplier, ...updates.supplier };
      if (updates.invoice) updateData.invoice = { ...expense.invoice, ...updates.invoice };
      if (updates.amounts) updateData.amounts = updates.amounts;
      if (updates.items !== undefined) updateData.items = updates.items;
      if (updates.categoryId !== undefined) updateData.categoryId = updates.categoryId;
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      if (updates.status) updateData.status = updates.status;
      if (updates.archivedAt !== undefined) updateData.archivedAt = updates.archivedAt;
    }

    if (isConfirming && !updates?.status) {
      updateData.status = 'confirmed';
    }

    await expenseRef.update(updateData);

    // Al marcar como pagado: crear entry de pago en cuenta corriente
    if (updateData.status === 'paid' && expense.status !== 'paid') {
      const vendorId =
        expense.supplier?.vendorId ||
        (expense.supplier?.cuit
          ? expense.supplier.cuit.replace(/\D/g, '').slice(0, 20)
          : `temp-${expenseId}`);

      const entriesCol = db
        .collection('schools')
        .doc(schoolId)
        .collection('vendorAccounts')
        .doc(vendorId)
        .collection('entries');

      const entryRef = entriesCol.doc();
      const entryId = entryRef.id;
      const amount = expense.amounts?.total ?? 0;
      const entry: Omit<VendorAccountEntry, 'id'> & { id: string } = {
        id: entryId,
        vendorId,
        schoolId,
        date: new Date().toISOString().slice(0, 10),
        type: 'payment',
        ref: { expenseId },
        debit: 0,
        credit: amount,
        description: `Pago factura ${expense.invoice?.type || ''} ${expense.invoice?.number || ''}`,
        createdAt: new Date().toISOString(),
      };
      await entryRef.set(entry);
    }

    // Al confirmar: crear entry en cuenta corriente del proveedor
    if (updateData.status === 'confirmed' && expense.status === 'draft') {
      const vendorId =
        expense.supplier?.vendorId ||
        (expense.supplier?.cuit
          ? expense.supplier.cuit.replace(/\D/g, '').slice(0, 20)
          : `temp-${expenseId}`);

      const entriesCol = db
        .collection('schools')
        .doc(schoolId)
        .collection('vendorAccounts')
        .doc(vendorId)
        .collection('entries');

      const entryRef = entriesCol.doc();
      const entryId = entryRef.id;
      const entry: Omit<VendorAccountEntry, 'id'> & { id: string } = {
        id: entryId,
        vendorId,
        schoolId,
        date: expense.invoice?.issueDate || expense.createdAt,
        type: 'invoice',
        ref: { expenseId },
        debit: expense.amounts?.total ?? 0,
        credit: 0,
        description: `Factura ${expense.invoice?.type || ''} ${expense.invoice?.number || ''} - ${expense.supplier?.name || 'Proveedor'}`,
        createdAt: new Date().toISOString(),
      };

      await entryRef.set(entry);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[expenses PATCH]', err);
    return NextResponse.json({ error: 'Error al actualizar gasto' }, { status: 500 });
  }
}
