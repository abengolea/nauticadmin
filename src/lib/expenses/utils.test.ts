/**
 * Tests unitarios para validaciones contables y deduplicación.
 */

import { describe, it, expect } from 'vitest';
import {
  validateTotalMatches,
  validateIvaMatches,
  validateCuit,
  getDedupeKey,
} from './utils';
import type { ExpenseAmounts } from './types';

describe('validateTotalMatches', () => {
  it('retorna true cuando total == net + iva', () => {
    expect(
      validateTotalMatches({ currency: 'ARS', net: 1000, iva: 210, total: 1210 })
    ).toBe(true);
  });

  it('retorna true cuando solo hay total (ticket sin desglose)', () => {
    expect(validateTotalMatches({ currency: 'ARS', total: 500 })).toBe(true);
  });

  it('retorna false cuando total no coincide', () => {
    expect(
      validateTotalMatches({ currency: 'ARS', net: 1000, iva: 210, total: 1200 })
    ).toBe(false);
  });

  it('tolera diferencias de redondeo de 1 centavo', () => {
    expect(
      validateTotalMatches({ currency: 'ARS', net: 100, iva: 21, total: 121.005 })
    ).toBe(true);
  });
});

describe('validateIvaMatches', () => {
  it('retorna true cuando iva coincide con alícuotas', () => {
    expect(
      validateIvaMatches({
        currency: 'ARS',
        iva: 105,
        total: 605,
        breakdown: {
          alicuotas: [
            { base: 500, rate: 21, amount: 105 },
          ],
        },
      })
    ).toBe(true);
  });

  it('retorna true cuando no hay alícuotas', () => {
    expect(validateIvaMatches({ currency: 'ARS', total: 500 })).toBe(true);
  });
});

describe('validateCuit', () => {
  it('retorna true para CUIT válido', () => {
    expect(validateCuit('20-12345678-6')).toBe(true);
  });

  it('retorna true para string vacío (opcional)', () => {
    expect(validateCuit('')).toBe(true);
  });
});

describe('getDedupeKey', () => {
  it('genera clave consistente para mismo gasto', () => {
    const expense = {
      supplier: { cuit: '20-12345678-9' },
      invoice: { pos: '0001', number: '12345', issueDate: '2024-01-15' },
      amounts: { total: 1210 },
    };
    const key = getDedupeKey(expense);
    expect(key).toContain('20123456789');
    expect(key).toContain('0001');
    expect(key).toContain('12345');
    expect(key).toContain('1210');
    expect(key).toContain('2024-01-15');
  });
});
