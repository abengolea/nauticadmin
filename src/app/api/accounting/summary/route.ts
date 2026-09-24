/**
 * GET /api/accounting/summary?schoolId=...&year=2025&month=3
 * Resumen contable: ingresos, gastos, resultado y saldos de cuentas corrientes.
 * Sin month: resumen anual del año indicado.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken, isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { getAccountingSummary } from '@/lib/accounting/db';

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    if (!schoolId?.trim()) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta náutica' }, { status: 403 });
    }

    const now = new Date();
    const year = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
    const month =
      monthParam && monthParam !== 'all'
        ? parseInt(monthParam, 10)
        : undefined;

    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Año inválido' }, { status: 400 });
    }
    if (month != null && (Number.isNaN(month) || month < 1 || month > 12)) {
      return NextResponse.json({ error: 'Mes inválido' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const summary = await getAccountingSummary(db, schoolId, year, month);

    return NextResponse.json(summary);
  } catch (err) {
    console.error('[accounting/summary GET]', err);
    return NextResponse.json({ error: 'Error al obtener resumen contable' }, { status: 500 });
  }
}
