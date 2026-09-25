/**
 * Cálculo de importes fiscales según clase de comprobante — WSFEv1 v4.8.
 * Factura C: ImpIVA=0, sin bloque Iva, ImpNeto=ImpTotal (tipo C).
 */

import { CBTE_TIPO, ALICUOTA_IVA_21, type CbteTipo } from './constants';
import type { AlicIva } from '@/lib/afip/wsfe';

export interface FiscalAmounts {
  impTotal: number;
  impTotConc: number;
  impNeto: number;
  impOpEx: number;
  impIva: number;
  impTrib: number;
  iva?: AlicIva[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Monto pagado IVA-incluido (Factura B/A) o total (Factura C).
 */
export function calculateFiscalAmounts(totalPaid: number, cbteTipo: CbteTipo): FiscalAmounts {
  if (cbteTipo === CBTE_TIPO.FACTURA_C) {
    return {
      impTotal: round2(totalPaid),
      impTotConc: 0,
      impNeto: round2(totalPaid),
      impOpEx: 0,
      impIva: 0,
      impTrib: 0,
      iva: undefined,
    };
  }

  const impTotal = round2(totalPaid);
  const impNeto = round2(impTotal / 1.21);
  const impIva = round2(impTotal - impNeto);

  return {
    impTotal,
    impTotConc: 0,
    impNeto,
    impOpEx: 0,
    impIva,
    impTrib: 0,
    iva: [{ Id: ALICUOTA_IVA_21, BaseImp: impNeto, Importe: impIva }],
  };
}

export function isFacturaC(cbteTipo: number): boolean {
  return cbteTipo === CBTE_TIPO.FACTURA_C || cbteTipo === 11;
}
