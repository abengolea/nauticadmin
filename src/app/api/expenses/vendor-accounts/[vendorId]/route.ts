/**
 * GET /api/expenses/vendor-accounts/[vendorId]?schoolId=...
 * Obtiene la cuenta corriente de un proveedor (entries + saldo).
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import type { VendorAccountEntry } from '@/lib/expenses/types';

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
    const snap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('vendorAccounts')
      .doc(vendorId)
      .collection('entries')
      .orderBy('date', 'asc')
      .orderBy('createdAt', 'asc')
      .get();

    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() } as VendorAccountEntry));

    let balance = 0;
    const entriesWithBalance = entries.map((e) => {
      balance += e.debit - e.credit;
      return { ...e, balanceAfter: balance };
    });

    return NextResponse.json({
      vendorId,
      entries: entriesWithBalance,
      balance,
    });
  } catch (err) {
    console.error('[vendor-accounts GET]', err);
    return NextResponse.json({ error: 'Error al obtener cuenta corriente' }, { status: 500 });
  }
}
