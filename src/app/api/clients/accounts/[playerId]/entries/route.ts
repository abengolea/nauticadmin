/**
 * POST /api/clients/accounts/[playerId]/entries
 * Crea un movimiento manual en la cuenta corriente del cliente.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken, isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { createClientAccountEntry, isClientAccountEnabled } from '@/lib/client-accounts/db';
import { createClientAccountEntrySchema } from '@/lib/client-accounts/schemas';
import type { ClientAccountEntryType } from '@/lib/client-accounts/types';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { playerId } = await params;
    const body = await request.json();
    const parsed = createClientAccountEntrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { schoolId, type, date, amount, description, period } = parsed.data;

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta náutica' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const enabled = await isClientAccountEnabled(db, schoolId, playerId);
    if (!enabled) {
      return NextResponse.json(
        { error: 'La cuenta corriente no está habilitada para este cliente (crédito activo = No)' },
        { status: 400 }
      );
    }

    let debit = 0;
    let credit = 0;
    let entryType: ClientAccountEntryType = type;

    switch (type) {
      case 'credit_note':
        credit = amount;
        break;
      case 'debit_note':
      case 'monthly_fee':
      case 'invoice':
        debit = amount;
        break;
      case 'adjustment':
        debit = amount;
        break;
      default:
        return NextResponse.json({ error: 'Tipo de movimiento no soportado' }, { status: 400 });
    }

    const entryId = await createClientAccountEntry(db, {
      schoolId,
      playerId,
      date,
      type: entryType,
      debit,
      credit,
      description,
      ref: period ? { period } : {},
    });

    if (!entryId) {
      return NextResponse.json({ error: 'No se pudo crear el movimiento' }, { status: 500 });
    }

    return NextResponse.json({ success: true, entryId });
  } catch (err) {
    console.error('[clients/accounts/entries POST]', err);
    return NextResponse.json({ error: 'Error al crear movimiento' }, { status: 500 });
  }
}
