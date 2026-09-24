/**
 * Matching tolerante para razones sociales y nombres con typos del listado Visa.
 */

import { normalizeString } from "../text-normalize";

const LEGAL_SUFFIXES = /\b(SA|SRL|SAS|SH|SN|S A|S R L)\b/gi;

/** Correcciones frecuentes en listados manuales. */
const TYPO_FIXES: Array<[RegExp, string]> = [
  [/\bSERVICIOA\b/gi, "SERVICIOS"],
  [/\bSERVICO\b/gi, "SERVICIOS"],
  [/\bPORTUARIO\b/gi, "PORTUARIOS"],
];

export function normalizeLegalName(raw: string): string {
  let s = normalizeString(raw);
  for (const [re, rep] of TYPO_FIXES) {
    s = s.replace(re, rep);
  }
  s = s.replace(/\./g, " ");
  s = s.replace(LEGAL_SUFFIXES, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function significantTokens(normalized: string): string[] {
  return normalized
    .split(/\s+/)
    .filter((t) => t.length > 2 && !/^(SA|SRL|DE|LA|EL|Y)$/.test(t));
}

/** Similitud 0–1 entre dos nombres (Jaccard sobre tokens + bonus si uno contiene al otro). */
export function fuzzyNameScore(a: string, b: string): number {
  const na = normalizeLegalName(a);
  const nb = normalizeLegalName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;

  const ta = significantTokens(na);
  const tb = significantTokens(nb);
  if (ta.length === 0 || tb.length === 0) return 0;

  const setB = new Set(tb);
  let inter = 0;
  for (const t of ta) {
    if (setB.has(t)) inter++;
  }
  const union = new Set([...ta, ...tb]).size;
  return inter / union;
}

export type FuzzyCandidate<T> = {
  item: T;
  score: number;
};

/**
 * Mejor match fuzzy si supera umbral y gana por margen claro al segundo.
 */
export function pickFuzzyMatch<T>(
  target: string,
  candidates: T[],
  scoreFn: (target: string, candidate: T) => number,
  opts?: { minScore?: number; minGap?: number }
): T | undefined {
  const minScore = opts?.minScore ?? 0.72;
  const minGap = opts?.minGap ?? 0.12;

  const scored: FuzzyCandidate<T>[] = candidates
    .map((item) => ({ item, score: scoreFn(target, item) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return undefined;
  if (scored.length === 1) return scored[0]!.item;
  if (scored[0]!.score - scored[1]!.score >= minGap) return scored[0]!.item;
  return undefined;
}
