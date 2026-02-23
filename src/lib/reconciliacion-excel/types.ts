/**
 * Tipos para el módulo de conciliación Excel/CSV.
 */

export type RelationRow = {
  accountKey: string;
  payerKey: string;
  payerRaw: string;
  accountRaw: string;
  createdAt: string;
};

export type PaymentRow = {
  rowId: string;
  payerRaw: string;
  amount: number;
  date: string;
  reference: string;
};

export type MatchType = "exact" | "fuzzy" | "manual";

export type ReconciliationStatus = "MATCHED" | "REVIEW" | "UNMATCHED";

export type ReconciliationResult = {
  paymentRowId: string;
  payerRaw: string;
  payerKey: string;
  matchedAccountKey: string | null;
  matchType: MatchType;
  score: number;
  status: ReconciliationStatus;
  candidateAccounts: Array<{ accountKey: string; accountRaw: string; score: number }>;
  timestamp: string;
};

export type ColumnMapping = {
  payer: string;
  amount: string;
  date: string;
  reference: string;
};

export type AuditLogEntry = {
  paymentRowId: string;
  payerRaw: string;
  payerKey: string;
  matchedAccountKey: string | null;
  matchType: MatchType;
  score: number;
  timestamp: string;
};
