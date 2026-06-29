/**
 * GET /api/expenses/vendors?schoolId=...&q=...
 * Lista proveedores del catálogo (expenseVendors).
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken, isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import type { ExpenseVendor } from '@/lib/expenses/types';

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId')?.trim();
    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const q = searchParams.get('q')?.trim().toLowerCase() ?? '';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '1000', 10) || 1000, 2000);

    const db = getAdminFirestore();
    const snap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('expenseVendors')
      .orderBy('name')
      .limit(limit)
      .get();

    let vendors = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExpenseVendor));

    if (q) {
      vendors = vendors.filter(
        (v) =>
          v.name?.toLowerCase().includes(q) ||
          v.cuit?.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
          v.externalCode?.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ vendors, total: vendors.length });
  } catch (err) {
    console.error('[vendors GET list]', err);
    return NextResponse.json({ error: 'Error al listar proveedores' }, { status: 500 });
  }
}
