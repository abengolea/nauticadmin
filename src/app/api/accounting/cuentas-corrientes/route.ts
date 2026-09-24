/**
 * GET /api/accounting/cuentas-corrientes?schoolId=...&q=...
 * Lista saldos individuales de cuentas corrientes de clientes y proveedores.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken, isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import {
  listClientAccountBalances,
  listVendorAccountBalances,
} from '@/lib/accounting/db';

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const q = searchParams.get('q') ?? undefined;

    if (!schoolId?.trim()) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta náutica' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const [clientes, proveedores] = await Promise.all([
      listClientAccountBalances(db, schoolId, q),
      listVendorAccountBalances(db, schoolId, q),
    ]);

    return NextResponse.json({ clientes, proveedores });
  } catch (err) {
    console.error('[accounting/cuentas-corrientes GET]', err);
    return NextResponse.json({ error: 'Error al listar cuentas corrientes' }, { status: 500 });
  }
}
