/**
 * GET /api/platform-fee/schools/[schoolId]/config
 * Obtiene configuración de mensualidad de la escuela (super admin).
 *
 * PUT /api/platform-fee/schools/[schoolId]/config
 * Actualiza configuración (solo super admin).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getOrCreateSchoolFeeConfig, saveSchoolFeeConfig } from '@/lib/payments/platform-fee';
import { verifySuperAdmin } from '@/lib/auth-server';

const PutBodySchema = z.object({
  monthlyAmount: z.number().min(0),
  isBonified: z.boolean(),
  currency: z.string().min(1).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ schoolId: string }> }
) {
  try {
    const auth = await verifySuperAdmin(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'Solo super admin' }, { status: 403 });
    }

    const { schoolId } = await params;
    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId requerido' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const config = await getOrCreateSchoolFeeConfig(db, schoolId);

    return NextResponse.json({
      ...config,
      updatedAt: config.updatedAt.toISOString(),
    });
  } catch (e) {
    console.error('[platform-fee/schools/config GET]', e);
    return NextResponse.json(
      { error: 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ schoolId: string }> }
) {
  try {
    const auth = await verifySuperAdmin(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'Solo super admin' }, { status: 403 });
    }

    const { schoolId } = await params;
    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId requerido' }, { status: 400 });
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
    const current = await getOrCreateSchoolFeeConfig(db, schoolId);
    const now = new Date();

    await saveSchoolFeeConfig(db, schoolId, {
      ...current,
      ...parsed.data,
      updatedAt: now,
      updatedBy: auth.uid,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[platform-fee/schools/config PUT]', e);
    return NextResponse.json(
      { error: 'Error al actualizar configuración' },
      { status: 500 }
    );
  }
}
