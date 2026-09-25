/**
 * Datos autorizados por ARCA — única fuente para PDF y QR.
 */

import type { CondicionIvaReceptorId, FacturacionModo } from './constants';
import type { FiscalAmounts } from './amounts';

export interface AuthorizedInvoiceData {
  /** Emisor */
  emisorRazonSocial: string;
  emisorCuit: string;
  emisorDomicilio: string;
  emisorCondicionIVA: string;

  /** Comprobante */
  cbteTipo: number;
  tipoComprobanteLabel: string;
  voucherClass: 'A' | 'B' | 'C' | 'M';
  puntoVenta: number;
  numero: number;
  fecha: string;
  conceptoDescripcion: string;

  /** Receptor */
  receptorRazonSocial: string;
  receptorDomicilio: string;
  condicionIVAReceptorId: CondicionIvaReceptorId;
  condicionIVAReceptorLabel: string;
  docTipoReceptor: number;
  docNroReceptor: number;
  docDisplayReceptor: string;

  /** Importes (exactamente los autorizados) */
  amounts: FiscalAmounts;

  /** Moneda */
  monedaAfip: string;
  cotizacionAfip: number;
  cotizacionFecha?: string;
  cancelaMismaMonedaExtranjera: boolean;

  /** CAE */
  cae: string;
  caeFchVto: string;
  afipResultado: string;
  afipObservaciones: Array<{ code: number; msg: string }>;

  /** Metadata */
  facturacionModo: FacturacionModo;
  simulacion: boolean;
}

export interface FiscalAuditPayload {
  afipResultado?: string;
  afipObservaciones?: Array<{ code: number; msg: string }>;
  afipErrores?: Array<{ code: number; msg: string }>;
  condicionIVAReceptorId: number;
  docTipoReceptor: number;
  docNroReceptor: number;
  monedaAfip: string;
  cotizacionAfip: number;
  cotizacionFecha?: string;
  cancelaMismaMonedaExtranjera?: boolean;
  emitidoAt?: Date;
  emitidoPorUid?: string;
  facturacionModo: FacturacionModo;
  afipRequestSanitized?: string;
  afipResponseSanitized?: string;
}
