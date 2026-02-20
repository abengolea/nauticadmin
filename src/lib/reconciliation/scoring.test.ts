/**
 * Tests unitarios para scoring y matching.
 */

import { describe, it, expect } from 'vitest';
import {
  tokenSetRatio,
  computeScore,
  getTopCandidates,
  getMatchDecision,
  buildPayerNorm,
} from './scoring';

describe('tokenSetRatio', () => {
  it('retorna 100 para conjuntos vacíos', () => {
    expect(tokenSetRatio([], [])).toBe(100);
  });

  it('retorna 0 cuando uno está vacío', () => {
    expect(tokenSetRatio(['A'], [])).toBe(0);
    expect(tokenSetRatio([], ['B'])).toBe(0);
  });

  it('retorna 100 para tokens idénticos', () => {
    expect(tokenSetRatio(['JUAN', 'PEREZ'], ['JUAN', 'PEREZ'])).toBe(100);
  });

  it('calcula similitud parcial', () => {
    expect(tokenSetRatio(['JUAN', 'PEREZ'], ['JUAN', 'GARCIA'])).toBe(50);
  });
});

describe('computeScore', () => {
  it('retorna 100 para coincidencia exacta', () => {
    expect(computeScore('JUAN PEREZ', ['JUAN', 'PEREZ'], 'JUAN PEREZ', ['JUAN', 'PEREZ'])).toBe(100);
  });

  it('usa tokenSetRatio para no exactos', () => {
    const s = computeScore('JUAN PEREZ', ['JUAN', 'PEREZ'], 'JUAN GARCIA', ['JUAN', 'GARCIA']);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(100);
  });
});

describe('getTopCandidates', () => {
  const clients = [
    { client_id: 'c1', full_name_raw: 'Juan Pérez', full_name_norm: 'JUAN PEREZ', tokens: ['JUAN', 'PEREZ'] },
    { client_id: 'c2', full_name_raw: 'Juan García', full_name_norm: 'JUAN GARCIA', tokens: ['JUAN', 'GARCIA'] },
    { client_id: 'c3', full_name_raw: 'María López', full_name_norm: 'MARIA LOPEZ', tokens: ['MARIA', 'LOPEZ'] },
  ];

  it('retorna top 5 por defecto', () => {
    const top = getTopCandidates('JUAN PEREZ', ['JUAN', 'PEREZ'], clients);
    expect(top.length).toBeLessThanOrEqual(5);
  });

  it('ordena por score descendente', () => {
    const top = getTopCandidates('JUAN PEREZ', ['JUAN', 'PEREZ'], clients);
    expect(top[0]?.score).toBe(100);
    expect(top[0]?.client_id).toBe('c1');
  });

  it('filtra score 0', () => {
    const top = getTopCandidates('XYZ ABC', ['XYZ', 'ABC'], clients);
    expect(top.every((c) => c.score > 0)).toBe(true);
  });
});

describe('getMatchDecision', () => {
  it('retorna no_match cuando scoreTop1 < 75', () => {
    expect(getMatchDecision([{ client_id: 'c1', client_name_raw: 'X', score: 50 }])).toBe('no_match');
  });

  it('retorna auto cuando scoreTop1 >= 90 y gap >= 10', () => {
    expect(
      getMatchDecision([
        { client_id: 'c1', client_name_raw: 'X', score: 95 },
        { client_id: 'c2', client_name_raw: 'Y', score: 80 },
      ])
    ).toBe('auto');
  });

  it('retorna conflict cuando gap < 5', () => {
    expect(
      getMatchDecision([
        { client_id: 'c1', client_name_raw: 'X', score: 85 },
        { client_id: 'c2', client_name_raw: 'Y', score: 83 },
      ])
    ).toBe('conflict');
  });

  it('retorna review cuando score entre 75 y 89.99', () => {
    expect(
      getMatchDecision([
        { client_id: 'c1', client_name_raw: 'X', score: 80 },
        { client_id: 'c2', client_name_raw: 'Y', score: 60 },
      ])
    ).toBe('review');
  });
});

describe('buildPayerNorm', () => {
  it('combina Dato Opcional 1 y 2', () => {
    expect(buildPayerNorm('Pérez', 'Juan')).toBe('PEREZ JUAN');
  });

  it('maneja null/undefined', () => {
    expect(buildPayerNorm('', 'Perez')).toBe('PEREZ');
    expect(buildPayerNorm('Perez', '')).toBe('PEREZ');
  });
});
