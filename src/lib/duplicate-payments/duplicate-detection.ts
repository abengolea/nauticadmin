/**
 * DuplicateDetectionService: busca pagos similares por fingerprint en ventana temporal.
 */

import type admin from 'firebase-admin';
import { COLLECTIONS } from '@/lib/payments/constants';
import { computeFingerprintHash } from './fingerprint';
import type { Payment } from '@/lib/types/payments';

type Firestore = admin.firestore.Firestore;
type DocumentSnapshot = admin.firestore.DocumentSnapshot;

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  const t = val as { toDate?: () => Date };
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof val === 'string') return new Date(val);
  return new Date();
}

function toPayment(docSnap: DocumentSnapshot): Payment {
  const d = docSnap.data()!;
  return {
    id: docSnap.id,
    playerId: d.playerId,
    schoolId: d.schoolId,
    period: d.period,
    amount: d.amount,
    currency: d.currency ?? 'ARS',
    provider: d.provider,
    providerPaymentId: d.providerPaymentId,
    status: d.status,
    paidAt: d.paidAt ? toDate(d.paidAt) : undefined,
    createdAt: toDate(d.createdAt),
    metadata: d.metadata,
    paymentType: d.paymentType,
    method: d.method,
    reference: d.reference,
    fingerprintHash: d.fingerprintHash,
    duplicateStatus: d.duplicateStatus,
    duplicateCaseId: d.duplicateCaseId,
    updatedAt: d.updatedAt ? toDate(d.updatedAt) : undefined,
  };
}

export interface FindSimilarPaymentsParams {
  schoolId: string;
  customerId: string;
  amount: number;
  currency: string;
  paidAt: Date;
  windowMinutes?: number;
  reference?: string | null;
  method?: string;
  /** Excluir este paymentId (ej. el que estamos ingresando) */
  excludePaymentId?: string;
}

/**
 * Busca pagos similares por fingerprint en la ventana temporal.
 * Retorna pagos acreditados/aprobados que coinciden en customerId, amount, currency, fingerprint.
 */
export async function findSimilarPayments(
  db: Firestore,
  params: FindSimilarPaymentsParams
): Promise<Payment[]> {
  const {
    schoolId,
    customerId,
    amount,
    currency,
    paidAt,
    windowMinutes = 30,
    reference,
    method = 'unknown',
    excludePaymentId,
  } = params;

  const fingerprintHash = computeFingerprintHash({
    customerId,
    amount,
    currency,
    paidAt,
    method,
    reference,
    windowMinutes,
  });

  const snap = await db
    .collection(COLLECTIONS.payments)
    .where('schoolId', '==', schoolId)
    .where('fingerprintHash', '==', fingerprintHash)
    .where('status', '==', 'approved')
    .get();

  const payments: Payment[] = [];
  const windowMs = windowMinutes * 60 * 1000;
  const paidAtMs = paidAt.getTime();

  for (const doc of snap.docs) {
    if (excludePaymentId && doc.id === excludePaymentId) continue;

    const p = toPayment(doc);
    const pPaidAt = p.paidAt ?? p.createdAt;
    const pPaidAtMs = pPaidAt.getTime();
    if (Math.abs(pPaidAtMs - paidAtMs) <= windowMs) {
      payments.push(p);
    }
  }

  return payments;
}
