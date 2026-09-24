/**
 * Lógica principal de conciliación.
 */

import { normalizePayer } from "./normalize";
import { buildPayerIndex, reconcileSingle } from "./matcher";
import { cardLast4 } from "./parser";
import type {
  RelationRow,
  PaymentRow,
  ReconciliationResult,
  AuditLogEntry,
} from "./types";

function buildCardIndex(relations: RelationRow[]): Map<string, RelationRow[]> {
  const index = new Map<string, RelationRow[]>();
  for (const r of relations) {
    if (!r.cardLast4) continue;
    const list = index.get(r.cardLast4) ?? [];
    list.push(r);
    index.set(r.cardLast4, list);
  }
  return index;
}

export function runReconciliation(
  relations: RelationRow[],
  payments: PaymentRow[]
): ReconciliationResult[] {
  const payerIndex = buildPayerIndex(relations);
  const cardIndex = buildCardIndex(relations);
  const results: ReconciliationResult[] = [];
  const now = new Date().toISOString();

  for (const pay of payments) {
    let match = reconcileSingle(pay.payerRaw, pay.reference, payerIndex);

    if (match.status === "UNMATCHED") {
      const last4 = cardLast4(pay.extras?.["Nro Tarjeta"] ?? "");
      const byCard = last4 ? cardIndex.get(last4) ?? [] : [];
      if (byCard.length === 1) {
        match = {
          status: "MATCHED",
          matchedAccountKey: byCard[0]!.accountKey,
          matchType: "exact",
          score: 1,
          candidates: [
            {
              accountKey: byCard[0]!.accountKey,
              accountRaw: byCard[0]!.accountRaw,
              score: 100,
            },
          ],
        };
      } else if (byCard.length > 1) {
        match = {
          status: "REVIEW",
          matchedAccountKey: null,
          matchType: "exact",
          score: 1,
          candidates: byCard.map((r) => ({
            accountKey: r.accountKey,
            accountRaw: r.accountRaw,
            score: 100,
          })),
        };
      }
    }

    results.push({
      paymentRowId: pay.rowId,
      payerRaw: pay.payerRaw,
      payerKey: normalizePayer(pay.payerRaw),
      amount: pay.amount,
      matchedAccountKey: match.matchedAccountKey,
      matchType: match.matchType,
      score: match.score,
      status: match.status,
      candidateAccounts: match.candidates,
      timestamp: now,
      sourceKind: pay.kind,
      aplicada: pay.extras?.Aplicada,
      cardLast4: cardLast4(pay.extras?.["Nro Tarjeta"] ?? "") || undefined,
    });
  }

  return results;
}

export function buildAuditEntries(
  results: ReconciliationResult[],
  payerKeyFn: (payerRaw: string) => string
): AuditLogEntry[] {
  return results.map((r) => ({
    paymentRowId: r.paymentRowId,
    payerRaw: r.payerRaw,
    payerKey: payerKeyFn(r.payerRaw),
    matchedAccountKey: r.matchedAccountKey,
    matchType: r.matchType,
    score: r.score,
    timestamp: r.timestamp,
  }));
}
