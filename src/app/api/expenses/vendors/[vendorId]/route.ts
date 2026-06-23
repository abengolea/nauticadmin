/**
 * GET /api/expenses/vendors/[vendorId]?schoolId=...
 * Obtiene datos del proveedor (de expenseVendors o de gastos).
 *
 * PATCH /api/expenses/vendors/[vendorId]
 * Actualiza o crea el proveedor en expenseVendors.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { updateVendorSchema } from '@/lib/expenses/schemas';
import type { ExpenseVendor, Expense } from '@/lib/expenses/types';
import { expenseVendorPath } from '@/lib/expenses/collections';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { vendorId } = await params;
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
    const vendorRef = db.doc(expenseVendorPath(schoolId, vendorId));
    const vendorSnap = await vendorRef.get();

    if (vendorSnap.exists) {
      const data = vendorSnap.data() as Omit<ExpenseVendor, 'id'>;
      return NextResponse.json({
        vendor: { id: vendorId, ...data },
        fromExpenseVendors: true,
      });
    }

    // No hay proveedor guardado: extraer datos de los gastos que coinciden con este vendorId
    const allExpensesSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('expenses')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const vendorIdNorm = vendorId.replace(/\D/g, '');
    const matchingExpenses = allExpensesSnap.docs.filter((d) => {
      const e = d.data() as Expense;
      const s = e.supplier;
      if (!s) return false;
      const eCuit = s.cuit?.replace(/\D/g, '') ?? '';
      const eVendorId = s.vendorId || eCuit || s.name?.trim();
      return (
        eVendorId === vendorId ||
        eCuit === vendorIdNorm ||
        (vendorIdNorm.length >= 10 && eCuit === vendorIdNorm)
      );
    });

    const latest = matchingExpenses[0];
    const supplier = latest?.data()?.supplier;

    const vendorFromExpenses: Partial<ExpenseVendor> = {
      id: vendorId,
      schoolId,
      name: supplier?.name ?? vendorId,
      cuit: supplier?.cuit,
      ivaCondition: supplier?.ivaCondition as ExpenseVendor['ivaCondition'],
      cuentaCorrienteHabilitada: true, // Si tiene cuenta corriente, está habilitada
    };

    return NextResponse.json({
      vendor: vendorFromExpenses,
      fromExpenseVendors: false,
      fromExpenses: matchingExpenses.length > 0,
    });
  } catch (err) {
    console.error('[vendors GET]', err);
    return NextResponse.json({ error: 'Error al obtener proveedor' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { vendorId } = await params;
    const body = await request.json();
    const parsed = updateVendorSchema.safeParse({ ...body, vendorId });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { schoolId, ...updates } = parsed.data;
    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const vendorRef = db.doc(expenseVendorPath(schoolId, vendorId));
    const vendorSnap = await vendorRef.get();

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) updateData[k] = v;
    }

    if (vendorSnap.exists) {
      await vendorRef.update(updateData);
    } else {
      await vendorRef.set({
        id: vendorId,
        schoolId,
        name: updates.name ?? vendorId,
        cuit: updates.cuit,
        ivaCondition: updates.ivaCondition,
        phone: updates.phone,
        email: updates.email,
        address: updates.address,
        cuentaCorrienteHabilitada: updates.cuentaCorrienteHabilitada ?? true,
        defaultCategoryId: updates.defaultCategoryId,
        notes: updates.notes,
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[vendors PATCH]', err);
    return NextResponse.json({ error: 'Error al actualizar proveedor' }, { status: 500 });
  }
}
