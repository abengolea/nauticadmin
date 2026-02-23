/**
 * Cálculo de fingerprint para detección de duplicados contables.
 * fingerprintHash = hash de (customerId + amount + currency + normalizedReference + method + timeBucket)
 */

import { createHash } from 'crypto';

const DEFAULT_WINDOW_MINUTES = 30;

/**
 * Normaliza la referencia para el fingerprint (quita espacios, lowercase, etc.).
 */
export function normalizeReference(ref: string | null | undefined): string {
  if (ref == null || typeof ref !== 'string') return '';
  return ref.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Calcula el timeBucket para una fecha (redondeo a ventana de minutos).
 * Ej: windowMinutes=30 → redondea a bloques de 30 min.
 */
export function getTimeBucket(paidAt: Date, windowMinutes: number = DEFAULT_WINDOW_MINUTES): number {
  const ms = paidAt.getTime();
  const bucketMs = windowMinutes * 60 * 1000;
  return Math.floor(ms / bucketMs) * bucketMs;
}

/**
 * Genera el fingerprint hash para un pago.
 * Usado para detectar duplicados contables (mismo cliente, monto, método, en ventana temporal).
 */
export function computeFingerprintHash(params: {
  customerId: string;
  amount: number;
  currency: string;
  paidAt: Date;
  method?: string;
  reference?: string | null;
  windowMinutes?: number;
}): string {
  const {
    customerId,
    amount,
    currency,
    paidAt,
    method = 'unknown',
    reference,
    windowMinutes = DEFAULT_WINDOW_MINUTES,
  } = params;

  const normalizedRef = normalizeReference(reference ?? '');
  const timeBucket = getTimeBucket(paidAt, windowMinutes);

  const payload = [
    customerId,
    String(amount),
    currency,
    normalizedRef,
    method,
    String(timeBucket),
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}
