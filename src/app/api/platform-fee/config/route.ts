/**
 * GET /api/platform-fee/config
 * Obtiene configuración global de mensualidades (super admin).
 *
 * PUT /api/platform-fee/config
 * Actualiza configuración (solo super admin).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getOrCreatePlatformFeeConfig, savePlatformFeeConfig } from '@/lib/payments/platform-fee';
import { verifySuperAdmin } from '@/lib/auth-server';

export async function GET(request: Request) {
  try {
    const auth = await verifySuperAdmin(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'Solo super admin' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const config = await getOrCreatePlatformFeeConfig(db);

    return NextResponse.json({
      ...config,
      updatedAt: config.updatedAt.toISOString(),
    });
  } catch (e) {
    console.error('[platform-fee/config GET]', e);
    return NextResponse.json(
      { error: 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}

const PutBodySchema = z.object({
  dueDayOfMonth: z.number().int().min(1).max(31),
  delinquencyDaysWarning: z.number().int().min(1).max(90).optional(),
  delinquencyDaysSuspension: z.number().int().min(1).max(365).optional(),
  lateFeePercent: z.number().min(0).max(50).optional(),
  currency: z.string().min(1).optional(),
  defaultMonthlyAmount: z.number().min(0).optional(),
});

export async function PUT(request: Request) {
  try {
    const auth = await verifySuperAdmin(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'Solo super admin' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = PutBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const current = await getOrCreatePlatformFeeConfig(db);
    const now = new Date();

    await savePlatformFeeConfig(db, {
      ...current,
      ...parsed.data,
      updatedAt: now,
      updatedBy: auth.uid,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[platform-fee/config PUT]', e);
    return NextResponse.json(
      { error: 'Error al actualizar configuración' },
      { status: 500 }
    );
  }
}
