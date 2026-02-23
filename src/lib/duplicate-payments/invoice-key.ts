/**
 * Generación de invoiceKey para idempotencia de facturación.
 * invoiceKey = sha256(customerId + concept + periodKey + amount + currency)
 */

import { createHash } from 'crypto';

export function computeInvoiceKey(params: {
  customerId: string;
  concept: string;
  periodKey: string | null;
  amount: number;
  currency: string;
}): string {
  const { customerId, concept, periodKey, amount, currency } = params;
  const payload = [customerId, concept, periodKey ?? '', String(amount), currency].join('|');
  return createHash('sha256').update(payload).digest('hex');
}
