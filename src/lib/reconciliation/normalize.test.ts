/**
 * Tests unitarios para normalizeName y tokenize.
 */

import { describe, it, expect } from 'vitest';
import { normalizeName, tokenize, normalizeAndTokenize } from './normalize';

describe('normalizeName', () => {
  it('retorna string vacío para input no string', () => {
    expect(normalizeName(null as unknown as string)).toBe('');
    expect(normalizeName(undefined as unknown as string)).toBe('');
    expect(normalizeName(123 as unknown as string)).toBe('');
  });

  it('aplica trim y uppercase', () => {
    expect(normalizeName('  juan pérez  ')).toBe('JUAN PEREZ');
    expect(normalizeName('MARÍA GARCÍA')).toBe('MARIA GARCIA');
  });

  it('elimina tildes y diacríticos', () => {
    expect(normalizeName('José Rodríguez')).toBe('JOSE RODRIGUEZ');
    expect(normalizeName('Ñoño')).toBe('NONO');
    expect(normalizeName('ÁÉÍÓÚ')).toBe('AEIOU');
  });

  it('reemplaza signos/puntos/guiones por espacio', () => {
    expect(normalizeName('Apellido,Nombre')).toBe('APELLIDO NOMBRE');
    expect(normalizeName('García-López')).toBe('GARCIA LOPEZ');
    expect(normalizeName('Razón.Social')).toBe('RAZON SOCIAL');
  });

  it('colapsa espacios múltiples', () => {
    expect(normalizeName('Juan   Carlos   Pérez')).toBe('JUAN CARLOS PEREZ');
  });

  it('normaliza nombres compuestos', () => {
    expect(normalizeName('Apellido Nombres//Razón Social')).toBe('APELLIDO NOMBRES RAZON SOCIAL');
  });
});

describe('tokenize', () => {
  it('retorna array vacío para input no string', () => {
    expect(tokenize(null as unknown as string)).toEqual([]);
  });

  it('divide por espacios y filtra vacíos', () => {
    expect(tokenize('JUAN')).toEqual(['JUAN']);
    expect(tokenize('JUAN PEREZ')).toEqual(['JUAN', 'PEREZ']);
    expect(tokenize('  JUAN   PEREZ  ')).toEqual(['JUAN', 'PEREZ']);
  });
});

describe('normalizeAndTokenize', () => {
  it('retorna normalized y tokens', () => {
    const result = normalizeAndTokenize('  José Pérez  ');
    expect(result.normalized).toBe('JOSE PEREZ');
    expect(result.tokens).toEqual(['JOSE', 'PEREZ']);
  });
});
