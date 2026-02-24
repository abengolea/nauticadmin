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
    const impNeto = params.amount;
    const impIva = Math.round(params.amount * 0.21 * 100) / 100;
    const impTotal = impNeto + impIva;

    const voucherParams: Parameters<typeof createNextVoucher>[0] = {
      PtoVta: params.ptoVta ?? config.ptoVta,
      CbteTipo: params.cbteTipo ?? config.cbteTipo,
      Concepto: 2,
      DocTipo: docTipo,
      DocNro: docNro,
      CbteFch: date,
      ImpTotal: impTotal,
      ImpTotConc: 0,
      ImpNeto: impNeto,
      ImpOpEx: 0,
      ImpIVA: impIva,
      ImpTrib: 0,
      MonId: params.currency === 'USD' ? 'DOL' : 'PES',
      MonCotiz: params.currency === 'USD' ? 1 : 1,
      CondIVAReceptor: 5, // Consumidor Final
      Iva: [{ Id: 5, BaseImp: impNeto, Importe: impIva }], // Id 5 = 21%
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
