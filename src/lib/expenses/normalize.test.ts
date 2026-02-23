/**
 * Tests unitarios para normalización de gastos (CUIT, números, fechas).
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeNumber,
  normalizeDate,
  normalizeCuit,
  validateCuitDigit,
  normalizeAndValidateCuit,
} from './normalize';

describe('normalizeNumber', () => {
  it('convierte formato argentino (punto miles, coma decimal)', () => {
    expect(normalizeNumber('526.350,00')).toBe(526350);
    expect(normalizeNumber('1.234,56')).toBe(1234.56);
    expect(normalizeNumber('0,50')).toBe(0.5);
    expect(normalizeNumber('68,8')).toBe(68.8);
  });

  it('interpreta punto como miles cuando no hay coma decimal (ej: 6.880)', () => {
    expect(normalizeNumber('6.880')).toBe(6880);
    expect(normalizeNumber('1.234')).toBe(1234);
  });

  it('acepta números ya parseados', () => {
    expect(normalizeNumber(1234.56)).toBe(1234.56);
    expect(normalizeNumber(0)).toBe(0);
  });

  it('retorna undefined para valores inválidos', () => {
    expect(normalizeNumber('')).toBeUndefined();
    expect(normalizeNumber('abc')).toBeUndefined();
    expect(normalizeNumber(null)).toBeUndefined();
    expect(normalizeNumber(undefined)).toBeUndefined();
  });
});

describe('normalizeDate', () => {
  it('convierte dd/mm/yyyy a ISO', () => {
    expect(normalizeDate('15/03/2024')).toBe('2024-03-15');
    expect(normalizeDate('01/12/2023')).toBe('2023-12-01');
  });

  it('convierte dd-mm-yyyy a ISO', () => {
    expect(normalizeDate('15-03-2024')).toBe('2024-03-15');
  });

  it('maneja año de 2 dígitos', () => {
    expect(normalizeDate('01/01/24')).toBe('2024-01-01');
    expect(normalizeDate('01/01/99')).toBe('1999-01-01');
  });

  it('retorna undefined para valores inválidos', () => {
    expect(normalizeDate('')).toBeUndefined();
    expect(normalizeDate('32/13/2024')).toBeUndefined();
    expect(normalizeDate('invalid')).toBeUndefined();
  });

  it('mantiene fecha ya en ISO', () => {
    expect(normalizeDate('2024-03-15')).toBe('2024-03-15');
  });
});

describe('normalizeCuit', () => {
  it('quita guiones y deja solo dígitos', () => {
    expect(normalizeCuit('20-12345678-9')).toBe('20123456789');
    expect(normalizeCuit('20 12345678 9')).toBe('20123456789');
  });

  it('retorna undefined si no tiene 11 dígitos', () => {
    expect(normalizeCuit('2012345678')).toBeUndefined();
    expect(normalizeCuit('201234567890')).toBeUndefined();
    expect(normalizeCuit('')).toBeUndefined();
  });
});

describe('validateCuitDigit', () => {
  it('valida CUIT correcto (dígito verificador calculado)', () => {
    // 2012345678: sum=148, 148%11=5, expected=6 => 20123456786 es válido
    expect(validateCuitDigit('20123456786')).toBe(true);
  });

  it('rechaza CUIT con dígito verificador incorrecto', () => {
    expect(validateCuitDigit('20123456789')).toBe(false);
    expect(validateCuitDigit('20123456781')).toBe(false);
  });

  it('rechaza string con longitud distinta a 11', () => {
    expect(validateCuitDigit('2012345678')).toBe(false);
  });
});

describe('normalizeAndValidateCuit', () => {
  it('retorna objeto con raw formateado y valid', () => {
    const result = normalizeAndValidateCuit('20-12345678-6');
    expect(result?.raw).toBe('20-12345678-6');
    expect(result?.valid).toBe(true);
  });

  it('retorna undefined para input inválido', () => {
    expect(normalizeAndValidateCuit('')).toBeUndefined();
    expect(normalizeAndValidateCuit('123')).toBeUndefined();
  });
});
