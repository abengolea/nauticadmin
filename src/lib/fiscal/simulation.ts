/**
 * Preview/simulación fiscal — no altera estado real del pago.
 */

import type { AuthorizedInvoiceData } from './authorized-invoice';
import type { CondicionIvaReceptorId, CbteTipo } from './constants';
import { getCondicionIvaLabel } from './iva-receptor';
import { calculateFiscalAmounts } from './amounts';
import { voucherClassFromCbteTipo } from './iva-receptor';
import type { ReceptorDocument } from './receptor-doc';

export function buildSimulationAuthorized(params: {
  emisor: { razonSocial: string; cuit: string; domicilio: string; condicionIVA: string };
  receptor: { razonSocial: string; domicilio: string };
  receptorDoc: ReceptorDocument;
  condicionIVAReceptorId: CondicionIvaReceptorId;
  cbteTipo: CbteTipo;
  tipoComprobanteLabel: string;
  ptoVta: number;
  numero: number;
  fecha: string;
  conceptoDescripcion: string;
  totalAmount: number;
  currency: string;
}): AuthorizedInvoiceData {
  const amounts = calculateFiscalAmounts(params.totalAmount, params.cbteTipo);
  const monedaAfip = params.currency.toUpperCase() === 'USD' ? 'DOL' : 'PES';

  return {
    emisorRazonSocial: params.emisor.razonSocial,
    emisorCuit: params.emisor.cuit,
    emisorDomicilio: params.emisor.domicilio,
    emisorCondicionIVA: params.emisor.condicionIVA,
    cbteTipo: params.cbteTipo,
    tipoComprobanteLabel: params.tipoComprobanteLabel,
    voucherClass: voucherClassFromCbteTipo(params.cbteTipo),
    puntoVenta: params.ptoVta,
    numero: params.numero,
    fecha: params.fecha,
    conceptoDescripcion: params.conceptoDescripcion,
    receptorRazonSocial: params.receptor.razonSocial,
    receptorDomicilio: params.receptor.domicilio,
    condicionIVAReceptorId: params.condicionIVAReceptorId,
    condicionIVAReceptorLabel: getCondicionIvaLabel(params.condicionIVAReceptorId),
    docTipoReceptor: params.receptorDoc.docTipo,
    docNroReceptor: params.receptorDoc.docNro,
    docDisplayReceptor: params.receptorDoc.docDisplay,
    amounts,
    monedaAfip,
    cotizacionAfip: 1,
    cancelaMismaMonedaExtranjera: false,
    cae: 'SIM-NO-VALIDO',
    caeFchVto: params.fecha,
    afipResultado: 'SIM',
    afipObservaciones: [],
    facturacionModo: 'simulacion',
    simulacion: true,
  };
}
