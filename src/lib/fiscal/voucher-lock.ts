/**
 * Lock distribuido para numeración fiscal (CUIT + PtoVta + CbteTipo).
 */

import type { Firestore } from 'firebase-admin/firestore';

const COLLECTION = 'fiscalVoucherLocks';
const LOCK_TTL_MS = 120_000;

export function lockDocId(cuit: string, ptoVta: number, cbteTipo: number): string {
  return `${cuit.replace(/\D/g, '')}_${ptoVta}_${cbteTipo}`;
}

export async function withVoucherLock<T>(
  db: Firestore,
  params: { cuit: string; ptoVta: number; cbteTipo: number; ownerId: string },
  fn: () => Promise<T>
): Promise<T> {
  const docId = lockDocId(params.cuit, params.ptoVta, params.cbteTipo);
  const ref = db.collection(COLLECTION).doc(docId);
  const now = Date.now();
  const expiresAt = now + LOCK_TTL_MS;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data()!;
      const lockedUntil = data.lockedUntil as number;
      if (lockedUntil > now && data.ownerId !== params.ownerId) {
        throw new Error(
          'Otra emisión fiscal está en curso para este punto de venta y tipo de comprobante. Reintentá en unos segundos.'
        );
      }
    }
    tx.set(ref, {
      ownerId: params.ownerId,
      lockedAt: now,
      lockedUntil: expiresAt,
      cuit: params.cuit,
      ptoVta: params.ptoVta,
      cbteTipo: params.cbteTipo,
    });
  });

  try {
    return await fn();
  } finally {
    await ref.delete().catch(() => undefined);
  }
}
