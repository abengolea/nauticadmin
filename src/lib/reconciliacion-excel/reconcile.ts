/**
 * Lógica principal de conciliación.
 */

import { normalizePayer } from "./normalize";
import { buildPayerIndex, reconcileSingle } from "./matcher";
import type {
  RelationRow,
  PaymentRow,
  ReconciliationResult,
  AuditLogEntry,
} from "./types";

export function runReconciliation(
  relations: RelationRow[],
  payments: PaymentRow[]
): ReconciliationResult[] {
  const payerIndex = buildPayerIndex(relations);
  const results: ReconciliationResult[] = [];
  const now = new Date().toISOString();

  for (const pay of payments) {
    const match = reconcileSingle(
      pay.payerRaw,
      pay.reference,
      payerIndex
    );

    results.push({
      paymentRowId: pay.rowId,
      payerRaw: pay.payerRaw,
      payerKey: normalizePayer(pay.payerRaw),
      matchedAccountKey: match.matchedAccountKey,
      matchType: match.matchType,
      score: match.score,
      status: match.status,
      candidateAccounts: match.candidates,
      timestamp: now,
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
