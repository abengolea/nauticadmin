/**
 * GET /api/platform-fee/payments
 * Lista pagos de mensualidades (solo super admin).
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { listSchoolFeePayments } from '@/lib/payments/platform-fee';
import { verifySuperAdmin } from '@/lib/auth-server';

export async function GET(request: Request) {
  try {
    const auth = await verifySuperAdmin(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'Solo super admin' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') ?? undefined;
    const period = searchParams.get('period') ?? undefined;
    const limit = parseInt(searchParams.get('limit') ?? '100', 10);

    const db = getAdminFirestore();
    const payments = await listSchoolFeePayments(db, { schoolId, period, limit });

    return NextResponse.json({
      payments: payments.map((p) => ({
        ...p,
        paidAt: p.paidAt?.toISOString(),
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error('[platform-fee/payments]', e);
    return NextResponse.json(
      { error: 'Error al listar pagos' },
      { status: 500 }
    );
  }
}
