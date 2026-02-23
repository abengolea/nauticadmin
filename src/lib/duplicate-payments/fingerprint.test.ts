import { describe, it, expect } from 'vitest';
import { computeFingerprintHash, getTimeBucket } from './fingerprint';

describe('fingerprint', () => {
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

  it('pagos en misma ventana temporal comparten timeBucket', () => {
    const d1 = new Date('2026-02-20T14:00:00Z');
    const d2 = new Date('2026-02-20T14:15:00Z');
    const bucket1 = getTimeBucket(d1, 30);
    const bucket2 = getTimeBucket(d2, 30);
    expect(bucket1).toBe(bucket2);
  });

  it('pagos en ventanas distintas tienen timeBucket distinto', () => {
    const d1 = new Date('2026-02-20T14:00:00Z');
    const d2 = new Date('2026-02-20T14:35:00Z');
    const bucket1 = getTimeBucket(d1, 30);
    const bucket2 = getTimeBucket(d2, 30);
    expect(bucket1).not.toBe(bucket2);
  });
});
