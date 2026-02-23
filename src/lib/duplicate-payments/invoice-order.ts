/**
 * InvoiceOrderService: creación idempotente de órdenes de facturación.
 */

import type admin from 'firebase-admin';
import { COLLECTIONS } from '@/lib/payments/constants';
import { computeInvoiceKey } from './invoice-key';
import type {
  InvoiceOrder,
  InvoiceOrderStatus,
  DuplicateCase,
  DuplicateCaseResolution,
  CustomerCredit,
} from './types';

type Firestore = admin.firestore.Firestore;

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  const t = val as { toDate?: () => Date };
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof val === 'string') return new Date(val);
  return new Date();
}

function toInvoiceOrder(doc: admin.firestore.DocumentSnapshot): InvoiceOrder {
  const d = doc.data()!;
  return {
    id: doc.id,
    schoolId: d.schoolId,
    customerId: d.customerId,
    periodKey: d.periodKey ?? null,
    concept: d.concept,
    amount: d.amount,
    currency: d.currency ?? 'ARS',
    paymentIdsApplied: d.paymentIdsApplied ?? [],
    invoiceKey: d.invoiceKey,
    status: d.status,
    afip: d.afip,
    pdfUrl: d.pdfUrl ?? null,
    email: d.email,
    failureReason: d.failureReason,
    retryCount: d.retryCount ?? 0,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

export interface CreateInvoiceOrderParams {
  schoolId: string;
  customerId: string;
  periodKey?: string | null;
  concept: string;
  amount: number;
  currency: string;
  paymentIdsApplied: string[];
}

/**
 * Crea InvoiceOrder de forma idempotente.
 * Si invoiceKey ya existe, retorna la existente sin crear nueva.
 */
export async function createInvoiceOrder(
  db: Firestore,
  params: CreateInvoiceOrderParams
): Promise<InvoiceOrder> {
  const { schoolId, customerId, periodKey = null, concept, amount, currency, paymentIdsApplied } = params;

  const invoiceKey = computeInvoiceKey({
    customerId,
    concept,
    periodKey,
    amount,
    currency,
  });

  // Lookup por invoiceKey: usar doc id = invoiceKey para transacción atómica
  const orderRef = db.collection(COLLECTIONS.invoiceOrders).doc(invoiceKey);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(orderRef);
    if (existing.exists) {
      return toInvoiceOrder(existing);
    }

    const admin = await import('firebase-admin');
    const now = admin.firestore.Timestamp.now();

    const orderData = {
      schoolId,
      customerId,
      periodKey,
      concept,
      amount,
      currency,
      paymentIdsApplied,
      invoiceKey,
      status: 'pending' as InvoiceOrderStatus,
      createdAt: now,
      updatedAt: now,
    };

    tx.set(orderRef, orderData);

    return {
      id: invoiceKey,
      ...orderData,
      afip: undefined,
      pdfUrl: null,
      email: undefined,
      failureReason: undefined,
      retryCount: 0,
      createdAt: toDate(now),
      updatedAt: toDate(now),
    } as InvoiceOrder;
  });
}

/**
 * Crea InvoiceOrder(s) y créditos según la resolución del DuplicateCase.
 */
export async function createInvoiceOrdersFromResolution(
  db: Firestore,
  duplicateCase: DuplicateCase,
  resolution: DuplicateCaseResolution
): Promise<{ invoiceOrderIds: string[]; creditId?: string }> {
  if (duplicateCase.status !== 'open') {
    throw new Error('DuplicateCase must be open to resolve');
  }

  const admin = await import('firebase-admin');
  const now = admin.firestore.Timestamp.now();
  const invoiceOrderIds: string[] = [];
  let creditId: string | undefined;

  const caseRef = db.collection(COLLECTIONS.duplicateCases).doc(duplicateCase.id);

  switch (resolution.type) {
    case 'invoice_one_credit_rest': {
      const [chosenId, ...restIds] = resolution.chosenPaymentIds;
      if (!chosenId) throw new Error('chosenPaymentIds must have at least one');

      const paymentsSnap = await db
        .collection(COLLECTIONS.payments)
        .doc(chosenId)
        .get();
      const paymentData = paymentsSnap.data();
      if (!paymentData) throw new Error(`Payment ${chosenId} not found`);

      const order = await createInvoiceOrder(db, {
        schoolId: duplicateCase.schoolId,
        customerId: duplicateCase.customerId,
        periodKey: null,
        concept: `Cuota - Caso duplicado ${duplicateCase.id}`,
        amount: paymentData.amount as number,
        currency: (paymentData.currency as string) ?? 'ARS',
        paymentIdsApplied: [chosenId],
      });
      invoiceOrderIds.push(order.id);

      // Crédito para el resto
      if (restIds.length > 0) {
        const restPayments = await Promise.all(
          restIds.map((id) => db.collection(COLLECTIONS.payments).doc(id).get())
        );
        const totalCredit = restPayments.reduce(
          (sum, snap) => sum + ((snap.data()?.amount as number) ?? 0),
          0
        );
        if (totalCredit > 0) {
          const creditRef = await db.collection(COLLECTIONS.customerCredits).add({
            schoolId: duplicateCase.schoolId,
            customerId: duplicateCase.customerId,
            amount: totalCredit,
            currency: (paymentData.currency as string) ?? 'ARS',
            sourcePaymentIds: restIds,
            sourceDuplicateCaseId: duplicateCase.id,
            createdAt: now,
            updatedAt: now,
          });
          creditId = creditRef.id;
        }
      }

      // Marcar pagos
      const batch = db.batch();
      for (const pid of duplicateCase.paymentIds) {
        const ref = db.collection(COLLECTIONS.payments).doc(pid);
        batch.update(ref, {
          duplicateStatus: resolution.chosenPaymentIds.includes(pid) ? 'confirmed' : 'ignored',
          updatedAt: now,
        });
      }
      batch.update(caseRef, {
        status: 'resolved',
        resolution: {
          type: resolution.type,
          chosenPaymentIds: resolution.chosenPaymentIds,
          notes: resolution.notes,
          resolvedBy: resolution.resolvedBy,
          resolvedAt: resolution.resolvedAt,
        },
        updatedAt: now,
      });
      await batch.commit();
      break;
    }

    case 'invoice_all': {
      const paymentIds = duplicateCase.paymentIds;
      let totalAmount = 0;
      let currency = 'ARS';
      for (const pid of paymentIds) {
        const snap = await db.collection(COLLECTIONS.payments).doc(pid).get();
        const d = snap.data();
        if (d) {
          totalAmount += (d.amount as number) ?? 0;
          currency = (d.currency as string) ?? 'ARS';
        }
      }

      const order = await createInvoiceOrder(db, {
        schoolId: duplicateCase.schoolId,
        customerId: duplicateCase.customerId,
        periodKey: null,
        concept: `Cuota múltiple - Caso duplicado ${duplicateCase.id}`,
        amount: totalAmount,
        currency,
        paymentIdsApplied: duplicateCase.paymentIds,
      });
      invoiceOrderIds.push(order.id);

      const batch = db.batch();
      for (const pid of duplicateCase.paymentIds) {
        const ref = db.collection(COLLECTIONS.payments).doc(pid);
        batch.update(ref, { duplicateStatus: 'confirmed', updatedAt: now });
      }
      batch.update(caseRef, {
        status: 'resolved',
        resolution: {
          type: resolution.type,
          chosenPaymentIds: resolution.chosenPaymentIds,
          notes: resolution.notes,
          resolvedBy: resolution.resolvedBy,
          resolvedAt: resolution.resolvedAt,
        },
        updatedAt: now,
      });
      await batch.commit();
      break;
    }

    case 'refund_one':
    case 'ignore_duplicates': {
      const batch = db.batch();
      for (const pid of duplicateCase.paymentIds) {
        const ref = db.collection(COLLECTIONS.payments).doc(pid);
        batch.update(ref, {
          duplicateStatus: 'ignored',
          ...(resolution.type === 'refund_one' && resolution.chosenPaymentIds.includes(pid)
            ? { status: 'refunded' }
            : {}),
          updatedAt: now,
        });
      }
      batch.update(caseRef, {
        status: resolution.type === 'ignore_duplicates' ? 'dismissed' : 'resolved',
        resolution: {
          type: resolution.type,
          chosenPaymentIds: resolution.chosenPaymentIds,
          notes: resolution.notes,
          resolvedBy: resolution.resolvedBy,
          resolvedAt: resolution.resolvedAt,
        },
        updatedAt: now,
      });
      await batch.commit();
      break;
    }

    default:
      throw new Error(`Unknown resolution type: ${(resolution as { type: string }).type}`);
  }

  return { invoiceOrderIds, creditId };
}

/** Obtiene InvoiceOrders pendientes para procesar */
export async function getPendingInvoiceOrders(
  db: Firestore,
  schoolId?: string,
  limit = 50
): Promise<InvoiceOrder[]> {
  let q = db
    .collection(COLLECTIONS.invoiceOrders)
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .limit(limit) as admin.firestore.Query;

  if (schoolId) {
    q = q.where('schoolId', '==', schoolId) as admin.firestore.Query;
  }

  const snap = await q.get();
  return snap.docs.map((d) => toInvoiceOrder(d));
}

/** Obtiene InvoiceOrders fallidos para reintentar */
export async function getFailedInvoiceOrders(
  db: Firestore,
  schoolId?: string,
  limit = 20
): Promise<InvoiceOrder[]> {
  let q = db
    .collection(COLLECTIONS.invoiceOrders)
    .where('status', '==', 'failed')
    .orderBy('updatedAt', 'asc')
    .limit(limit) as admin.firestore.Query;

  if (schoolId) {
    q = q.where('schoolId', '==', schoolId) as admin.firestore.Query;
  }

  const snap = await q.get();
  return snap.docs.map((d) => toInvoiceOrder(d));
}
