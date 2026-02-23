/**
 * Interface y stub para emisión de facturas AFIP (WSFE).
 * TODO: Implementar integración real con AFIP cuando esté disponible.
 */

import type { InvoiceOrderAfip } from './types';

export interface AfipEmitParams {
  ptoVta?: number;
  cbteTipo?: number;
  concept: string;
  amount: number;
  currency: string;
  customerId: string;
  /** Datos del cliente para la factura */
  customerDocTipo?: number;
  customerDocNro?: string;
  customerName?: string;
}

export interface AfipEmitResult {
  cbteNro: number;
  cae: string;
  caeVto: string;
}

/**
 * Emite comprobante en AFIP WSFE.
 * STUB: Retorna datos simulados. Implementar con librería afip/afip.js o similar.
 */
export async function emitAfipComprobante(params: AfipEmitParams): Promise<AfipEmitResult> {
  // TODO: Integrar con AFIP WSFE real
  // Ejemplo con afip.js: const afip = new Afip({...}); afip.ElectronicBilling.createVoucher(...)
  console.warn('[afip-stub] emitAfipComprobante: stub - no se emite factura real', params);

  return {
    cbteNro: Math.floor(Math.random() * 900000) + 100000,
    cae: `STUB-${Date.now()}`,
    caeVto: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
}
