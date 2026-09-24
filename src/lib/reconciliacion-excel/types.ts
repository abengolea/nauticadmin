/**
 * Tipos para el módulo de conciliación Excel/CSV.
 */

export type RelationRow = {
  accountKey: string;
  payerKey: string;
  payerRaw: string;
  accountRaw: string;
  createdAt: string;
  /** Últimos 4 de la tarjeta, para cruzar con la rendición DA. */
  cardLast4?: string;
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
  amount: number;
  matchedAccountKey: string | null;
  matchType: MatchType;
  score: number;
  status: ReconciliationStatus;
  candidateAccounts: Array<{ accountKey: string; accountRaw: string; score: number }>;
  timestamp: string;
  sourceKind?: PaymentFileKind;
  aplicada?: string;
  cardLast4?: string;
};

export type ImputePaymentItem = {
  paymentRowId: string;
  payerRaw: string;
  amount: number;
  accountKey: string;
  accountRaw: string;
  sourceKind?: PaymentFileKind;
  aplicada?: string;
  cardLast4?: string;
};

export type ColumnMappingCoreField =
  | "payer"
  | "lastName"
  | "firstName"
  | "amount"
  | "date"
  | "reference";

export type ColumnMapping = {
  payer: string;
  lastName?: string;
  firstName?: string;
  amount: string;
  date: string;
  reference: string;
  extras: ExtraMappedField[];
};

/** Encabezados del Excel Rendición DA (Visa crédito/débito). */
export const RENDICION_DA_HEADERS = [
  "Dato Opcional 1",
  "Dato Opcional 2",
  "Nro Tarjeta",
  "Importe",
  "Aplicada",
  "Observaciones",
] as const;

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
