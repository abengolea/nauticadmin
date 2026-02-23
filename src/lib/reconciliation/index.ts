/**
 * Sistema de Conciliación de Pagos.
 * Exporta tipos, funciones y constantes.
 */

export * from './types';
export * from './normalize';
export * from './scoring';
export * from './parse-excel';
export * from './matching';

export const REC_COLLECTIONS = {
  clients: 'recClients',
  payments: 'recPayments',
  matches: 'recMatches',
  payerAliases: 'recPayerAliases',
  pendingPayerAliases: 'recPendingPayerAliases',
  importBatches: 'recImportBatches',
} as const;
