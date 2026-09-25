/**
 * Cliente AFIP para emisión de facturas electrónicas.
 * Integración directa con AFIP (WSAA + WSFE), sin dependencias externas.
 */

import { getAfipConfig } from './afip-config';
import { createNextVoucher } from '@/lib/afip/wsfe';
import type { AfipEmitParams, AfipEmitResult } from './afip-stub';

export type { AfipEmitParams, AfipEmitResult } from './afip-stub';

/** Formato fecha AFIP: yyyymmdd */
function toAfipDate(d: Date): number {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return parseInt(`${y}${m}${day}`, 10);
}

/**
 * Emite comprobante en AFIP WSFE.
 * Si hay config válida usa integración directa; sino retorna stub.
 */
export async function emitAfipComprobante(params: AfipEmitParams): Promise<AfipEmitResult> {
  const config = getAfipConfig();

  if (!config) {
    return emitAfipStub(params);
  }

  try {
    const date = toAfipDate(new Date());
    const docTipo = params.customerDocTipo ?? 99;
    const docNro = params.customerDocNro
      ? parseInt(params.customerDocNro.replace(/\D/g, ''), 10)
      : 0;

    // Si ImpNeto > 0, AFIP exige el bloque Iva (error 10070)
    const cbteTipo = params.cbteTipo ?? config.cbteTipo;
    const { calculateFiscalAmounts } = await import('@/lib/fiscal/amounts');
    const { CONDICION_IVA_RECEPTOR } = await import('@/lib/fiscal/constants');
    const amounts = calculateFiscalAmounts(params.amount, cbteTipo as 1 | 6 | 11);

    const voucherParams: Parameters<typeof createNextVoucher>[0] = {
      PtoVta: params.ptoVta ?? config.ptoVta,
      CbteTipo: cbteTipo,
      Concepto: 2,
      DocTipo: docTipo,
      DocNro: docNro,
      CbteFch: date,
      ImpTotal: amounts.impTotal,
      ImpTotConc: amounts.impTotConc,
      ImpNeto: amounts.impNeto,
      ImpOpEx: amounts.impOpEx,
      ImpIVA: amounts.impIva,
      ImpTrib: amounts.impTrib,
      MonId: params.currency === 'USD' ? 'DOL' : 'PES',
      MonCotiz: 1,
      CondIVAReceptor: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
      Iva: amounts.iva,
    };

    const res = await createNextVoucher(voucherParams);

    return {
      cbteNro: res.voucherNumber,
      cae: res.CAE,
      caeVto: res.CAEFchVto,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[afip-client] Error emitiendo comprobante:', msg);
    throw new Error(`AFIP: ${msg}`);
  }
}

function emitAfipStub(params: AfipEmitParams): AfipEmitResult {
  console.warn('[afip-client] Sin config AFIP - usando stub', params.concept);
  return {
    cbteNro: Math.floor(Math.random() * 900000) + 100000,
    cae: `STUB-${Date.now()}`,
    caeVto: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
}
