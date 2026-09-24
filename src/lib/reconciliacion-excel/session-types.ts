import type {
  PaymentRow,
  ReconciliationResult,
  RelationRow,
} from "./types";

export type RecExcelSessionStatus = "in_progress" | "completed";

export type RecExcelSession = {
  period: string;
  status: RecExcelSessionStatus;
  relations: RelationRow[];
  payments: PaymentRow[];
  results: ReconciliationResult[];
  manualResolved: Record<string, string>;
  manualPlayerAssignments: Record<string, string>;
  /** Conciliados (matched + manual resolve) */
  totalConciliated: number;
  /** Pagos ya acreditados en Cobros (última corrida) */
  imputedCount: number;
  /** Sin cliente asignado todavía */
  pendingAssignCount: number;
  creditCount: number;
  debitCount: number;
  updatedAt: string;
  updatedBy: string;
};

export type RecExcelSessionSummary = Pick<
  RecExcelSession,
  | "period"
  | "status"
  | "totalConciliated"
  | "imputedCount"
  | "pendingAssignCount"
  | "creditCount"
  | "debitCount"
  | "updatedAt"
>;
