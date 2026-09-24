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

export type PaymentFileKind = "credit" | "debit";

export type ExtraMappedField = {
  id: string;
  label: string;
  column: string;
};

export type PaymentRow = {
  rowId: string;
  payerRaw: string;
  amount: number;
  date: string;
  reference: string;
  kind: PaymentFileKind;
  extras: Record<string, string>;
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
  sourceKind?: PaymentFileKind;
};

export type ColumnMappingCoreField = "payer" | "amount" | "date" | "reference";

export type ColumnMapping = {
  payer: string;
  amount: string;
  date: string;
  reference: string;
  extras: ExtraMappedField[];
};

export const PAYMENT_FILE_KIND_LABEL: Record<PaymentFileKind, string> = {
  credit: "Créditos",
  debit: "Débitos",
};

export type MappingProfile = {
  id: string;
  name: string;
  kind: PaymentFileKind;
  mapping: ColumnMapping;
  headers: string[];
  updatedAt: string;
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
