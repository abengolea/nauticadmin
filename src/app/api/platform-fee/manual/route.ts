/**
 * POST /api/platform-fee/manual
 * Registra pago manual de mensualidad (solo super admin).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase-admin';
import {
  findApprovedSchoolFeePayment,
  createSchoolFeePayment,
  getOrCreatePlatformFeeConfig,
  getSchoolMonthlyAmount,
} from '@/lib/payments/platform-fee';
import { verifySuperAdmin } from '@/lib/auth-server';

const BodySchema = z.object({
  schoolId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Formato YYYY-MM'),
  amount: z.number().min(0).optional(),
  lateFeeAmount: z.number().min(0).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await verifySuperAdmin(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'Solo super admin' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { schoolId, period } = parsed.data;
    const db = getAdminFirestore();

    const existing = await findApprovedSchoolFeePayment(db, schoolId, period);
    if (existing) {
      return NextResponse.json(
        { error: 'Esta mensualidad ya está pagada' },
        { status: 409 }
      );
    }

    const platformConfig = await getOrCreatePlatformFeeConfig(db);
    const baseAmount = parsed.data.amount ?? (await getSchoolMonthlyAmount(db, schoolId, platformConfig));
    const lateFeeAmount = parsed.data.lateFeeAmount ?? 0;
    const totalAmount = baseAmount + lateFeeAmount;

    const now = new Date();
    await createSchoolFeePayment(db, {
      schoolId,
      period,
      amount: baseAmount,
      lateFeeAmount: lateFeeAmount > 0 ? lateFeeAmount : undefined,
      currency: platformConfig.currency ?? 'ARS',
      provider: 'manual',
      status: 'approved',
      paidAt: now,
      manualRecordedBy: auth.uid,
    });

    return NextResponse.json({ ok: true, amount: totalAmount });
  } catch (e) {
    console.error('[platform-fee/manual]', e);
    return NextResponse.json(
      { error: 'Error al registrar pago manual' },
      { status: 500 }
    );
  }
}
