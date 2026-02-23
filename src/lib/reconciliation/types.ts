/**
 * Tipos para el Sistema de Conciliación de Pagos.
 * Colecciones: recClients, recPayments, recMatches, recPayerAliases, recImportBatches
 */

export type MatchStatus = 'auto' | 'confirmed' | 'pending' | 'rejected';

export type MatchDecision = 'auto' | 'review' | 'no_match' | 'conflict';

export interface RecClient {
  client_id: string;
  full_name_raw: string;
  full_name_norm: string;
  tokens: string[];
  /** Índice en el Excel original (0-based) */
  row_index: number;
  import_batch_id: string;
  created_at: string; // ISO
}

export interface RecPayment {
  payment_id: string;
  payer_raw: string;
  payer_norm: string;
  amount: number;
  id_usuario: string;
  nro_tarjeta: string;
  aplicada: boolean;
  observaciones: string;
  import_batch_id: string;
  created_at: string;
  matched_client_id?: string;
  match_status?: MatchStatus;
  match_id?: string;
  /** Índice en el Excel original */
  row_index: number;
}

export interface CandidateScore {
  client_id: string;
  client_name_raw: string;
  score: number;
}

export interface RecMatch {
  match_id: string;
  payment_id: string;
  client_id: string;
  status: MatchStatus;
  score: number;
  top_candidates: CandidateScore[];
  explanation: string;
  reason?: 'exact' | 'fuzzy' | 'alias';
  confirmed_by?: string;
  confirmed_at?: string;
  rejected_reason?: string;
  import_batch_id: string;
  created_at: string;
  updated_at?: string;
}

export interface PayerAlias {
  normalized_payer_name: string;
  /** ID del cliente en recClients (usado por conciliación). */
  client_id?: string;
  /** ID del jugador en schools/{schoolId}/players (usado por import-excel cuando viene de carga de alias). */
  player_id?: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
  updated_by?: string;
  notes?: string;
}

export interface AliasHistoryEntry {
  previous_client_id: string;
  changed_at: string;
  changed_by: string;
}

export interface RecImportBatch {
  import_batch_id: string;
  school_id: string;
  created_at: string;
  created_by: string;
  clients_count: number;
  payments_count: number;
  auto_count: number;
  review_count: number;
  nomatch_count: number;
  conflict_count: number;
}

/** Resultado del matching para un pago */
export interface MatchResult {
  decision: MatchDecision;
  payment_id: string;
  client_id?: string;
  score: number;
  top_candidates: CandidateScore[];
  explanation: string;
  reason?: 'exact' | 'fuzzy' | 'alias';
}

/** Input parseado del Excel de clientes */
export interface ParsedClientRow {
  full_name_raw: string;
  row_index: number;
}

/** Input parseado del Excel de pagos */
export interface ParsedPaymentRow {
  dato_opcional_1: string;
  dato_opcional_2: string;
  id_usuario: string;
  nro_tarjeta: string;
  importe: number;
  aplicada: boolean;
  observaciones: string;
  row_index: number;
}
