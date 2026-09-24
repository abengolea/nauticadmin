/**
 * GET /api/accounting/income-entries?schoolId=...&year=...&month=...
 * POST /api/accounting/income-entries — cargar ingreso manual (hielo, etc.)
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken, isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { createIncomeEntrySchema } from '@/lib/accounting/schemas';
import { listIncomeEntries } from '@/lib/accounting/db';

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

    const db = getAdminFirestore();
    const entries = await listIncomeEntries(db, schoolId, year, month);

    return NextResponse.json({ entries });
  } catch (err) {
    console.error('[accounting/income-entries GET]', err);
    return NextResponse.json({ error: 'Error al listar ingresos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createIncomeEntrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { schoolId, date, amount, currency, concept, category } = parsed.data;

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta náutica' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const now = new Date().toISOString();
    const ref = db.collection('schools').doc(schoolId).collection('incomeEntries').doc();

    await ref.set({
      id: ref.id,
      schoolId,
      date,
      amount,
      currency,
      concept,
      ...(category ? { category } : {}),
      createdAt: now,
      createdBy: auth.uid,
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (err) {
    console.error('[accounting/income-entries POST]', err);
    return NextResponse.json({ error: 'Error al registrar ingreso' }, { status: 500 });
  }
}
