/**
 * Tipos para el módulo de Detección de Duplicados + Facturación Idempotente.
 */

export type DuplicateCaseStatus = 'open' | 'resolved' | 'dismissed';

export type DuplicateResolutionType =
  | 'invoice_one_credit_rest'
  | 'invoice_all'
  | 'refund_one'
  | 'ignore_duplicates';

export interface DuplicateCaseResolution {
  type: DuplicateResolutionType;
  chosenPaymentIds: string[];
  notes: string;
  resolvedBy: string;
  resolvedAt: string; // ISO
}

export interface DuplicateCase {
  id: string;
  schoolId: string;
  customerId: string; // playerId en contexto de escuelas
  fingerprintHash: string;
  windowMinutes: number;
  paymentIds: string[];
  status: DuplicateCaseStatus;
  resolution?: DuplicateCaseResolution;
  createdAt: Date;
  updatedAt: Date;
}

export type InvoiceOrderStatus =
  | 'pending'
  | 'issuing'
  | 'issued'
  | 'pdf_ready'
  | 'email_sent'
  | 'failed';

export interface InvoiceOrderAfip {
  ptoVta: number;
  cbteTipo: number;
  cbteNro: number;
  cae: string;
  caeVto: string;
}

export interface InvoiceOrderEmail {
  to: string;
  messageId?: string;
  sentAt?: string;
}

export interface InvoiceOrder {
  id: string;
  schoolId: string;
  customerId: string;
  periodKey: string | null;
  concept: string;
  amount: number;
  currency: string;
  paymentIdsApplied: string[];
  invoiceKey: string;
  status: InvoiceOrderStatus;
  afip?: InvoiceOrderAfip;
  pdfUrl?: string | null;
  email?: InvoiceOrderEmail;
  failureReason?: string;
  retryCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerCredit {
  id: string;
  schoolId: string;
  customerId: string;
  amount: number;
  currency: string;
  sourcePaymentIds: string[];
  sourceDuplicateCaseId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IngestPaymentInput {
  provider: string;
  providerPaymentId?: string | null;
  customerId: string;
  schoolId: string;
  period: string;
  amount: number;
  currency: string;
  paidAt: Date;
  method?: 'card' | 'transfer' | 'cash' | 'unknown';
  reference?: string | null;
  status?: 'received' | 'accredited' | 'cancelled' | 'refunded';
}

export interface IngestPaymentResult {
  paymentId: string;
  isDuplicateTechnical: boolean;
  duplicateCaseId?: string;
  created: boolean;
}
