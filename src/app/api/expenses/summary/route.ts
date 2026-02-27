/**
 * GET /api/expenses/summary?schoolId=...
 * Resumen de contabilidad: total facturas, total pagos y saldo con proveedores.
 * Los pagos impactan en la cuenta corriente de cada proveedor y en este resumen total.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

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

    // Total facturas confirmadas o pagadas (deuda con proveedores)
    const expensesSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('expenses')
      .where('status', 'in', ['confirmed', 'paid'])
      .get();

    let totalFacturas = 0;
    expensesSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.archivedAt) return; // Excluir archivados
      const amount = data.amounts?.total ?? 0;
      totalFacturas += amount;
    });

    // Total pagos realizados a proveedores
    const paymentsSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('expensePayments')
      .get();

    let totalPagos = 0;
    paymentsSnap.docs.forEach((d) => {
      const data = d.data();
      totalPagos += data.amount ?? 0;
    });

    // Saldo total con proveedores (deuda pendiente = facturas - pagos)
    const saldoTotal = totalFacturas - totalPagos;

    return NextResponse.json({
      totalFacturas,
      totalPagos,
      saldoTotal,
      currency: 'ARS',
    });
  } catch (err) {
    console.error('[expenses/summary GET]', err);
    return NextResponse.json({ error: 'Error al obtener resumen' }, { status: 500 });
  }
}
