/**
 * POST /api/expenses/payments
 * Registra un pago a un proveedor. Crea el doc en expensePayments y un entry
 * en vendorAccounts (type: payment, credit: amount) para la cuenta corriente.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { registerPaymentSchema } from '@/lib/expenses/schemas';
import type { VendorAccountEntry } from '@/lib/expenses/types';

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = registerPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      schoolId,
      vendorId,
      amount,
      currency,
      date,
      method,
      reference,
      receiptType,
      receiptStoragePath,
      receiptDetails,
      appliedTo,
    } = parsed.data;

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const now = new Date().toISOString();

    // Crear doc en expensePayments
    const paymentsCol = db.collection('schools').doc(schoolId).collection('expensePayments');
    const paymentRef = paymentsCol.doc();
    const paymentId = paymentRef.id;

    const paymentData: Record<string, unknown> = {
      id: paymentId,
      schoolId,
      vendorId,
      amount,
      currency,
      date,
      appliedTo: appliedTo ?? [],
      createdAt: now,
      createdBy: auth.uid,
    };
    if (method != null && method !== '') paymentData.method = method;
    if (reference != null && reference !== '') paymentData.reference = reference;
    if (receiptType != null) paymentData.receiptType = receiptType;
    if (receiptStoragePath != null && receiptStoragePath !== '') paymentData.receiptStoragePath = receiptStoragePath;
    if (receiptDetails != null && Object.keys(receiptDetails).length > 0) paymentData.receiptDetails = receiptDetails;

    await paymentRef.set(paymentData);

    // Crear entry en cuenta corriente (haber = pago)
    const entriesCol = db
      .collection('schools')
      .doc(schoolId)
      .collection('vendorAccounts')
      .doc(vendorId)
      .collection('entries');

    const entryRef = entriesCol.doc();
    const entryId = entryRef.id;
    const descParts = ['Pago'];
    if (method) descParts.push(`(${method})`);
    if (reference) descParts.push(`Ref: ${reference}`);
    const description = descParts.join(' ');

    const entryData: Record<string, unknown> = {
      id: entryId,
      vendorId,
      schoolId,
      date,
      type: 'payment',
      ref: { paymentId },
      debit: 0,
      credit: amount,
      description,
      createdAt: now,
    };
    if (receiptStoragePath) entryData.receiptStoragePath = receiptStoragePath;
    if (receiptType) entryData.receiptType = receiptType;

    await entryRef.set(entryData);

    // Actualizar estado de las facturas aplicadas a "paid"
    if (appliedTo && appliedTo.length > 0) {
      const expensesCol = db.collection('schools').doc(schoolId).collection('expenses');
      const batch = db.batch();
      for (const { expenseId } of appliedTo) {
        if (expenseId) {
          const expenseRef = expensesCol.doc(expenseId);
          batch.update(expenseRef, {
            status: 'paid',
            updatedAt: now,
          });
        }
      }
      await batch.commit();
    }

    return NextResponse.json({ success: true, paymentId, entryId });
  } catch (err) {
    console.error('[expenses/payments POST]', err);
    return NextResponse.json({ error: 'Error al registrar pago' }, { status: 500 });
  }
}
