/**
 * POST /api/expenses/vendors/import
 * Importa/actualiza proveedores en expenseVendors (upsert masivo).
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken, isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { importVendorsSchema } from '@/lib/expenses/schemas';
import { expenseVendorsPath } from '@/lib/expenses/collections';

const BATCH_SIZE = 400;

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = importVendorsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { schoolId, vendors } = parsed.data;

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const now = new Date().toISOString();

    const existingSnap = await db.collection(expenseVendorsPath(schoolId)).select().get();
    const existingIds = new Set(existingSnap.docs.map((d) => d.id));

    let created = 0;
    let updated = 0;

    for (let i = 0; i < vendors.length; i += BATCH_SIZE) {
      const chunk = vendors.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      for (const v of chunk) {
        const vendorRef = db.collection(expenseVendorsPath(schoolId)).doc(v.vendorId);
        const isNew = !existingIds.has(v.vendorId);

        if (isNew) {
          batch.set(vendorRef, {
            id: v.vendorId,
            schoolId,
            name: v.name,
            cuit: v.cuit ?? null,
            address: v.address ?? null,
            ivaCondition: v.ivaCondition ?? null,
            cuentaCorrienteHabilitada: v.cuentaCorrienteHabilitada ?? true,
            externalCode: v.externalCode ?? null,
            creditDays: v.creditDays ?? null,
            createdAt: now,
            updatedAt: now,
          });
          created++;
          existingIds.add(v.vendorId);
        } else {
          batch.update(vendorRef, {
            name: v.name,
            cuit: v.cuit ?? null,
            address: v.address ?? null,
            ivaCondition: v.ivaCondition ?? null,
            cuentaCorrienteHabilitada: v.cuentaCorrienteHabilitada ?? true,
            externalCode: v.externalCode ?? null,
            creditDays: v.creditDays ?? null,
            updatedAt: now,
          });
          updated++;
        }
      }

      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      created,
      updated,
      total: vendors.length,
      message: `Importación completada: ${created} nuevos, ${updated} actualizados.`,
    });
  } catch (err) {
    console.error('[vendors import POST]', err);
    return NextResponse.json({ error: 'Error al importar proveedores' }, { status: 500 });
  }
}
