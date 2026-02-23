/**
 * Acceso a DuplicateCases en Firestore.
 */

import type admin from 'firebase-admin';
import { COLLECTIONS } from '@/lib/payments/constants';
import type { DuplicateCase } from './types';

type Firestore = admin.firestore.Firestore;

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  const t = val as { toDate?: () => Date };
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof val === 'string') return new Date(val);
  return new Date();
}

function toDuplicateCase(doc: admin.firestore.DocumentSnapshot): DuplicateCase {
  const d = doc.data()!;
  const resolution = d.resolution;
  return {
    id: doc.id,
    schoolId: d.schoolId,
    customerId: d.customerId,
    fingerprintHash: d.fingerprintHash,
    windowMinutes: d.windowMinutes ?? 30,
    paymentIds: d.paymentIds ?? [],
    status: d.status,
    resolution: resolution
      ? {
          type: resolution.type,
          chosenPaymentIds: resolution.chosenPaymentIds ?? [],
          notes: resolution.notes ?? '',
          resolvedBy: resolution.resolvedBy ?? '',
          resolvedAt: resolution.resolvedAt ?? '',
        }
      : undefined,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

export async function getDuplicateCase(
  db: Firestore,
  caseId: string
): Promise<DuplicateCase | null> {
  const snap = await db.collection(COLLECTIONS.duplicateCases).doc(caseId).get();
  if (!snap.exists) return null;
  return toDuplicateCase(snap);
}

export async function listOpenDuplicateCases(
  db: Firestore,
  schoolId: string,
  limit = 50
): Promise<DuplicateCase[]> {
  const snap = await db
    .collection(COLLECTIONS.duplicateCases)
    .where('schoolId', '==', schoolId)
    .where('status', '==', 'open')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((d) => toDuplicateCase(d));
}
