/**
 * Tipos para cuenta corriente contable de clientes.
 * Convención: debe = cargo al cliente, haber = cobro recibido.
 * Saldo positivo = el cliente nos debe.
 */

export type ClientAccountEntryType =
  | 'invoice'
  | 'payment'
  | 'monthly_fee'
  | 'credit_note'
  | 'debit_note'
  | 'adjustment';

export interface ClientAccountEntry {
  id: string;
  playerId: string;
  schoolId: string;
  date: string; // ISO date (YYYY-MM-DD o full ISO)
  type: ClientAccountEntryType;
  ref: {
    paymentId?: string;
    period?: string;
  };
  debit: number;
  credit: number;
  balanceAfter?: number;
  description: string;
  createdAt?: string;
  /** Path en Storage del comprobante de cobro (type=payment) */
  receiptStoragePath?: string;
}
