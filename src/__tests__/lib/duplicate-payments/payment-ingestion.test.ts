/**
 * Tests unitarios para PaymentIngestionService.
 * Requiere mocks de Firestore.
 */

import { describe, it, expect } from 'vitest';
import { computeFingerprintHash } from '../../../lib/duplicate-payments/fingerprint';
import { computeInvoiceKey } from '../../../lib/duplicate-payments/invoice-key';

describe('payment-ingestion (fingerprint + invoiceKey)', () => {
  describe('computeFingerprintHash', () => {
    it('mismo input produce mismo hash', () => {
      const d = new Date('2026-02-20T14:00:00Z');
      const h1 = computeFingerprintHash({
        customerId: 'p1',
        amount: 1000,
        currency: 'ARS',
        paidAt: d,
        method: 'card',
      });
      const h2 = computeFingerprintHash({
        customerId: 'p1',
        amount: 1000,
        currency: 'ARS',
        paidAt: d,
        method: 'card',
      });
      expect(h1).toBe(h2);
    });

    it('inputs distintos producen hashes distintos', () => {
      const d = new Date('2026-02-20T14:00:00Z');
      const h1 = computeFingerprintHash({
        customerId: 'p1',
        amount: 1000,
        currency: 'ARS',
        paidAt: d,
      });
      const h2 = computeFingerprintHash({
        customerId: 'p2',
        amount: 1000,
        currency: 'ARS',
        paidAt: d,
      });
      expect(h1).not.toBe(h2);
    });

    it('cambio de monto produce hash distinto', () => {
      const d = new Date('2026-02-20T14:00:00Z');
      const h1 = computeFingerprintHash({
        customerId: 'p1',
        amount: 1000,
        currency: 'ARS',
        paidAt: d,
      });
      const h2 = computeFingerprintHash({
        customerId: 'p1',
        amount: 2000,
        currency: 'ARS',
        paidAt: d,
      });
      expect(h1).not.toBe(h2);
    });
  });

  describe('computeInvoiceKey', () => {
    it('invoiceKey es determinístico para mismos params', () => {
      const k1 = computeInvoiceKey({
        customerId: 'c1',
        concept: 'Cuota 2026-02',
        periodKey: '2026-02',
        amount: 5000,
        currency: 'ARS',
      });
      const k2 = computeInvoiceKey({
        customerId: 'c1',
        concept: 'Cuota 2026-02',
        periodKey: '2026-02',
        amount: 5000,
        currency: 'ARS',
      });
      expect(k1).toBe(k2);
    });

    it('params distintos producen invoiceKey distinto', () => {
      const k1 = computeInvoiceKey({
        customerId: 'c1',
        concept: 'Cuota 2026-02',
        periodKey: '2026-02',
        amount: 5000,
        currency: 'ARS',
      });
      const k2 = computeInvoiceKey({
        customerId: 'c2',
        concept: 'Cuota 2026-02',
        periodKey: '2026-02',
        amount: 5000,
        currency: 'ARS',
      });
      expect(k1).not.toBe(k2);
    });
  });
});
