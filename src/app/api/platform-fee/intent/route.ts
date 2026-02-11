/**
 * POST /api/platform-fee/intent
 * Crea link de pago Mercado Pago para mensualidad de escuela (solo super admin).
 * Retorna checkoutUrl para redirigir a la escuela.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase-admin';
import {
  getOrCreatePlatformFeeConfig,
  getOrCreateSchoolFeeConfig,
  findApprovedSchoolFeePayment,
  getSchoolMonthlyAmount,
} from '@/lib/payments/platform-fee';
import { createPlatformFeePreference } from '@/lib/payments/mercadopago-platform-preference';
import { verifySuperAdmin } from '@/lib/auth-server';

const BodySchema = z.object({
  schoolId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Formato YYYY-MM'),
});

export async function POST(request: Request) {
  try {
    const auth = await verifySuperAdmin(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'Solo super admin' }, { status: 403 });
    }

    const platformToken = process.env.MERCADOPAGO_PLATFORM_ACCESS_TOKEN;
    if (!platformToken) {
      return NextResponse.json(
        { error: 'Mercado Pago no configurado para cobros de plataforma. Configurá MERCADOPAGO_PLATFORM_ACCESS_TOKEN.' },
        { status: 503 }
      );
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
    const schoolConfig = await getOrCreateSchoolFeeConfig(db, schoolId);

    if (schoolConfig.isBonified) {
      return NextResponse.json(
        { error: 'Esta escuela está bonificada y no debe pagar' },
        { status: 400 }
      );
    }

    const baseAmount = await getSchoolMonthlyAmount(db, schoolId, platformConfig);
    if (baseAmount <= 0) {
      return NextResponse.json(
        { error: 'No hay tarifa configurada para esta escuela' },
        { status: 400 }
      );
    }

    // Calcular mora si corresponde (simplificado: % por mes de atraso)
    const dueDay = platformConfig.dueDayOfMonth ?? 10;
    const [y, m] = period.split('-').map(Number);
    const day = Math.min(dueDay, new Date(y, m, 0).getDate());
    const dueDate = new Date(y, m - 1, day);
    const now = new Date();
    const daysOverdue = dueDate <= now ? Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)) : 0;
    const lateFeePct = (platformConfig.lateFeePercent ?? 5) / 100;
    const lateFeeAmount = Math.round(baseAmount * lateFeePct * Math.ceil(daysOverdue / 30));
    const totalAmount = baseAmount + lateFeeAmount;

    const schoolSnap = await db.collection('schools').doc(schoolId).get();
    const schoolName = schoolSnap.exists ? (schoolSnap.data()?.name ?? 'Escuela') : 'Escuela';

    const { init_point } = await createPlatformFeePreference(platformToken, {
      schoolId,
      schoolName,
      period,
      amount: totalAmount,
      currency: platformConfig.currency ?? 'ARS',
    });

    return NextResponse.json({
      checkoutUrl: init_point,
      amount: totalAmount,
      currency: platformConfig.currency ?? 'ARS',
      lateFeeAmount,
    });
  } catch (e) {
    console.error('[platform-fee/intent]', e);
    return NextResponse.json(
      { error: 'Error al crear link de pago' },
      { status: 500 }
    );
  }
}
