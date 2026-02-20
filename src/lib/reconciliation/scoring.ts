/**
 * Scoring y fuzzy matching para conciliación.
 * Funciones puras.
 */

import { normalizeName, tokenize } from './normalize';
import type { CandidateScore } from './types';

/**
 * Token Set Ratio: similitud entre dos conjuntos de tokens.
 * Usa Dice coefficient: 2 * |intersection| / (|A| + |B|)
 * Retorna 0-100.
 */
export function tokenSetRatio(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 100;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA.map((t) => t.toUpperCase()));
  const setB = new Set(tokensB.map((t) => t.toUpperCase()));
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const dice = (2 * intersection) / (setA.size + setB.size);
  return Math.round(dice * 100);
}

/**
 * Calcula el score entre payerName y clientName (ambos ya normalizados/tokenizados).
 */
export function computeScore(
  payerNorm: string,
  payerTokens: string[],
  clientNorm: string,
  clientTokens: string[]
): number {
  if (payerNorm === clientNorm) return 100;
  return tokenSetRatio(payerTokens, clientTokens);
}

/**
 * Obtiene los Top N candidatos ordenados por score descendente.
 */
export function getTopCandidates(
  payerNorm: string,
  payerTokens: string[],
  clients: Array<{ client_id: string; full_name_raw: string; full_name_norm: string; tokens: string[] }>,
  topN: number = 5
): CandidateScore[] {
  const scored = clients.map((c) => ({
    client_id: c.client_id,
    client_name_raw: c.full_name_raw,
    score: computeScore(payerNorm, payerTokens, c.full_name_norm, c.tokens),
  }));
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/**
 * Determina la decisión de matching según scores.
 * - AUTO: scoreTop1 >= 90 AND (scoreTop1 - scoreTop2) >= 10
 * - REVIEW: scoreTop1 entre 75 y 89.99 OR gap < 10
 * - NO_MATCH: scoreTop1 < 75
 * - CONFLICT: top1 y top2 muy cercanos (gap < 5)
 */
export function getMatchDecision(
  topCandidates: CandidateScore[]
): 'auto' | 'review' | 'no_match' | 'conflict' {
  const top1 = topCandidates[0];
  const top2 = topCandidates[1];
  const score1 = top1?.score ?? 0;
  const score2 = top2?.score ?? 0;
  const gap = score1 - score2;

  if (score1 < 75) return 'no_match';
  if (score1 >= 90 && gap >= 10) return 'auto';
  if (top2 && gap < 5 && score1 >= 75) return 'conflict';
  return 'review';
}

/**
 * Construye payerNameNorm desde Dato Opcional 1 y 2.
 */
export function buildPayerNorm(dato1: string, dato2: string): string {
  const combined = `${String(dato1 ?? '').trim()} ${String(dato2 ?? '').trim()}`.trim();
  return normalizeName(combined);
}
