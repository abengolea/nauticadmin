/**
 * Matcher con Jaro-Winkler para fuzzy matching.
 * Umbrales: >= 0.92 MATCHED, 0.85-0.92 REVIEW, < 0.85 UNMATCHED
 */

import { normalizePayer } from "./normalize";
import type { RelationRow } from "./types";

/** Jaro-Winkler similarity (0-1). Implementación propia. */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  const matchWindowClamped = Math.max(0, matchWindow);

  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindowClamped);
    const end = Math.min(i + matchWindowClamped + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

  const prefixScale = 0.1;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * prefixScale * (1 - jaro);
}

export type MatchResult = {
  accountKey: string;
  accountRaw: string;
  score: number;
  matchType: "exact" | "fuzzy";
};

/** Índice payerKey -> RelationRow[] para búsqueda O(1). */
export function buildPayerIndex(relations: RelationRow[]): Map<string, RelationRow[]> {
  const index = new Map<string, RelationRow[]>();
  for (const r of relations) {
    const list = index.get(r.payerKey) ?? [];
    list.push(r);
    index.set(r.payerKey, list);
  }
  return index;
}

export type ReconcileSingleResult = {
  status: "MATCHED" | "REVIEW" | "UNMATCHED";
  matchedAccountKey: string | null;
  matchType: "exact" | "fuzzy" | "manual";
  score: number;
  candidates: Array<{ accountKey: string; accountRaw: string; score: number }>;
};

/**
 * Concilia un pago contra el índice de relaciones.
 */
export function reconcileSingle(
  payerRaw: string,
  reference: string,
  payerIndex: Map<string, RelationRow[]>
): ReconcileSingleResult {
  const payerKey = normalizePayer(payerRaw);
  if (!payerKey) {
    return {
      status: "UNMATCHED",
      matchedAccountKey: null,
      matchType: "exact",
      score: 0,
      candidates: [],
    };
  }

  const exactMatches = payerIndex.get(payerKey) ?? [];

  if (exactMatches.length === 1) {
    return {
      status: "MATCHED",
      matchedAccountKey: exactMatches[0].accountKey,
      matchType: "exact",
      score: 1,
      candidates: [{ accountKey: exactMatches[0].accountKey, accountRaw: exactMatches[0].accountRaw, score: 100 }],
    };
  }

  if (exactMatches.length > 1) {
    const refNorm = reference.trim().toUpperCase();
    if (refNorm) {
      const byRef = exactMatches.find(
        (r) =>
          r.accountKey.includes(refNorm) ||
          r.accountRaw.toUpperCase().includes(refNorm)
      );
      if (byRef) {
        return {
          status: "MATCHED",
          matchedAccountKey: byRef.accountKey,
          matchType: "exact",
          score: 1,
          candidates: [{ accountKey: byRef.accountKey, accountRaw: byRef.accountRaw, score: 100 }],
        };
      }
    }
    return {
      status: "REVIEW",
      matchedAccountKey: null,
      matchType: "exact",
      score: 1,
      candidates: exactMatches.map((r) => ({ accountKey: r.accountKey, accountRaw: r.accountRaw, score: 100 })),
    };
  }

  const scored: Array<{ rel: RelationRow; score: number }> = [];
  for (const [idxPayerKey, relations] of payerIndex) {
    const sim = jaroWinkler(payerKey, idxPayerKey);
    if (sim >= 0.85 && relations.length > 0) {
      for (const rel of relations) {
        scored.push({ rel, score: sim });
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const byAccount = new Map<string, { rel: RelationRow; score: number }>();
  for (const s of scored) {
    if (!byAccount.has(s.rel.accountKey) || (byAccount.get(s.rel.accountKey)?.score ?? 0) < s.score) {
      byAccount.set(s.rel.accountKey, s);
    }
  }
  const uniqueScored = Array.from(byAccount.values()).sort((a, b) => b.score - a.score);
  const top = uniqueScored[0];
  const top2 = uniqueScored[1];

  if (!top) {
    return {
      status: "UNMATCHED",
      matchedAccountKey: null,
      matchType: "exact",
      score: 0,
      candidates: [],
    };
  }

  if (top.score >= 0.92 && (!top2 || top.score - top2.score >= 0.05)) {
    return {
      status: "MATCHED",
      matchedAccountKey: top.rel.accountKey,
      matchType: "fuzzy",
      score: top.score,
      candidates: uniqueScored.slice(0, 5).map((s) => ({
        accountKey: s.rel.accountKey,
        accountRaw: s.rel.accountRaw,
        score: Math.round(s.score * 100),
      })),
    };
  }

  if (top.score >= 0.85) {
    return {
      status: "REVIEW",
      matchedAccountKey: null,
      matchType: "fuzzy",
      score: top.score,
      candidates: uniqueScored.slice(0, 5).map((s) => ({
        accountKey: s.rel.accountKey,
        accountRaw: s.rel.accountRaw,
        score: Math.round(s.score * 100),
      })),
    };
  }

  return {
    status: "UNMATCHED",
    matchedAccountKey: null,
    matchType: "exact",
    score: top.score,
    candidates: [],
  };
}
