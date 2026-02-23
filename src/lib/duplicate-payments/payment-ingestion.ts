/**
 * PaymentIngestionService: ingesta pagos con idempotencia técnica y detección de duplicados.
 */

import type admin from 'firebase-admin';
import {
  findPaymentByProviderId,
  createPayment,
  playerExistsInSchool,
} from '@/lib/payments/db';
import { COLLECTIONS } from '@/lib/payments/constants';
import { computeFingerprintHash } from './fingerprint';
import { findSimilarPayments } from './duplicate-detection';
import type { IngestPaymentInput, IngestPaymentResult } from './types';
import type { Payment } from '@/lib/types/payments';

type Firestore = admin.firestore.Firestore;

const DEFAULT_WINDOW_MINUTES = 30;

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  const t = val as { toDate?: () => Date };
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof val === 'string') return new Date(val);
  return new Date();
}

/**
 * Ingesta un pago con:
 * - Dedupe técnico por provider + providerPaymentId (upsert, no crear)
 * - Dedupe contable por fingerprint (crear DuplicateCase si hay similares)
 */
export async function ingestPayment(
  db: Firestore,
  input: IngestPaymentInput
): Promise<IngestPaymentResult> {
  const paidAt = input.paidAt instanceof Date ? input.paidAt : new Date(input.paidAt);
  let status: Payment['status'] = 'approved';
  if (input.status === 'accredited' || input.status === 'received') status = 'approved';
  else if (input.status === 'cancelled') status = 'rejected';
  else if (input.status === 'refunded') status = 'refunded';
  else if (input.status === 'rejected') status = 'rejected';
  else if (input.status === 'pending') status = 'pending';
  const method = input.method ?? 'unknown';

  // 1) Dedupe técnico: si tiene providerPaymentId y ya existe, no crear
  if (input.providerPaymentId != null && input.providerPaymentId.trim() !== '') {
    const existing = await findPaymentByProviderId(
      db,
      input.provider,
      input.providerPaymentId
    );
    if (existing) {
      return {
        paymentId: existing.id,
        isDuplicateTechnical: true,
        created: false,
      };
    }
  }

  // 2) Verificar que el jugador exista
  const playerExists = await playerExistsInSchool(db, input.schoolId, input.customerId);
  if (!playerExists) {
    throw new Error(`Player ${input.customerId} not found in school ${input.schoolId}`);
  }

  // 3) Calcular fingerprint
  const fingerprintHash = computeFingerprintHash({
    customerId: input.customerId,
    amount: input.amount,
    currency: input.currency,
    paidAt,
    method,
    reference: input.reference,
    windowMinutes: DEFAULT_WINDOW_MINUTES,
  });

  // 4) Buscar pagos similares (duplicados contables)
  const similar = await findSimilarPayments(db, {
    schoolId: input.schoolId,
    customerId: input.customerId,
    amount: input.amount,
    currency: input.currency,
    paidAt,
    windowMinutes: DEFAULT_WINDOW_MINUTES,
    reference: input.reference,
    method,
  });

  const admin = await import('firebase-admin');
  const now = admin.firestore.Timestamp.now();

  // 5) Crear pago (con idempotencyKey si hay providerPaymentId)
  const paymentData: Omit<Payment, 'id' | 'createdAt'> = {
    playerId: input.customerId,
    schoolId: input.schoolId,
    period: input.period,
    amount: input.amount,
    currency: input.currency,
    provider: input.provider as Payment['provider'],
    providerPaymentId: input.providerPaymentId ?? undefined,
    status,
    paidAt,
    method: method as Payment['method'],
    reference: input.reference ?? undefined,
    fingerprintHash,
    duplicateStatus: similar.length > 0 ? 'suspected' : 'none',
    duplicateCaseId: null,
    updatedAt: toDate(now),
  };

  const idempotencyKey =
    input.providerPaymentId != null && input.providerPaymentId.trim() !== ''
      ? `${input.provider}_${input.providerPaymentId}`
      : undefined;

  const payment = await createPayment(db, paymentData, idempotencyKey);

  let duplicateCaseId: string | undefined;

  // 6) Si hay similares, crear o actualizar DuplicateCase
  if (similar.length > 0) {
    const allPaymentIds = [...similar.map((p) => p.id), payment.id];
    const existingCase = await findOpenCaseByPaymentIds(db, input.schoolId, similar[0].id);

    if (existingCase) {
      // Actualizar caso existente con el nuevo pago
      const caseRef = db.collection(COLLECTIONS.duplicateCases).doc(existingCase.id);
      const existingIds = existingCase.paymentIds ?? [];
      const newIds = [...new Set([...existingIds, payment.id])];
      await caseRef.update({
        paymentIds: newIds,
        updatedAt: now,
      });
      duplicateCaseId = existingCase.id;
    } else {
      // Crear nuevo DuplicateCase
      const caseRef = await db.collection(COLLECTIONS.duplicateCases).add({
        schoolId: input.schoolId,
        customerId: input.customerId,
        fingerprintHash,
        windowMinutes: DEFAULT_WINDOW_MINUTES,
        paymentIds: allPaymentIds,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      });
      duplicateCaseId = caseRef.id;

      // Actualizar pagos similares con duplicateCaseId y duplicateStatus
      const batch = db.batch();
      for (const p of similar) {
        const ref = db.collection(COLLECTIONS.payments).doc(p.id);
        batch.update(ref, {
          duplicateCaseId: caseRef.id,
          duplicateStatus: 'suspected',
          updatedAt: now,
        });
      }
      batch.update(db.collection(COLLECTIONS.payments).doc(payment.id), {
        duplicateCaseId: caseRef.id,
        duplicateStatus: 'suspected',
        updatedAt: now,
      });
      await batch.commit();
    }
  }

  return {
    paymentId: payment.id,
    isDuplicateTechnical: false,
    duplicateCaseId,
    created: true,
  };
}

/** Busca caso abierto que incluya un paymentId dado */
async function findOpenCaseByPaymentIds(
  db: Firestore,
  schoolId: string,
  paymentId: string
): Promise<{ id: string; paymentIds: string[] } | null> {
  const snap = await db
    .collection(COLLECTIONS.duplicateCases)
    .where('schoolId', '==', schoolId)
    .where('status', '==', 'open')
    .where('paymentIds', 'array-contains', paymentId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const d = snap.docs[0].data();
  return {
    id: snap.docs[0].id,
    paymentIds: (d.paymentIds as string[]) ?? [],
  };
}
