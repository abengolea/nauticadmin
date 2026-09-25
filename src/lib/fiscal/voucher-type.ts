/**
 * Determinación automática del tipo de comprobante (A/B/C).
 * Basado en condición IVA emisor × receptor — RG 4291 / práctica ARCA.
 * @see Manual WSFEv1 v4.8 — comprobantes tipo A, B, C
 */

import {
  CBTE_TIPO,
  CONDICION_IVA_EMISOR,
  CONDICION_IVA_RECEPTOR,
  type CondicionIvaEmisor,
  type CondicionIvaReceptorId,
  type CbteTipo,
} from './constants';
import { type CondicionIvaReceptorParam } from './iva-receptor';

export interface VoucherTypeInput {
  emisorCondicion: CondicionIvaEmisor;
  receptorCondicionId: CondicionIvaReceptorId;
  /** Tabla paramétrica opcional para validar Cmp_Clase */
  paramTable?: CondicionIvaReceptorParam[];
}

export interface VoucherTypeResult {
  cbteTipo: CbteTipo;
  clase: 'A' | 'B' | 'C';
  label: string;
}

function parseEmisorCondicion(raw: string | undefined): CondicionIvaEmisor {
  const v = (raw ?? '').trim().toLowerCase();
  if (v.includes('monotrib')) return CONDICION_IVA_EMISOR.MONOTRIBUTISTA;
  if (v.includes('exento')) return CONDICION_IVA_EMISOR.EXENTO;
  return CONDICION_IVA_EMISOR.RESPONSABLE_INSCRIPTO;
}

export function parseEmisorCondicionFromConfig(raw: string | undefined): CondicionIvaEmisor {
  return parseEmisorCondicion(raw);
}

/**
 * Determina el comprobante permitido según emisor y receptor.
 * RI → RI = Factura A; RI → otros = Factura B; Monotributo/Exento emisor = Factura C.
 */
export function determineVoucherType(input: VoucherTypeInput): VoucherTypeResult | { error: string } {
  const { emisorCondicion, receptorCondicionId } = input;

  if (
    emisorCondicion === CONDICION_IVA_EMISOR.MONOTRIBUTISTA ||
    emisorCondicion === CONDICION_IVA_EMISOR.EXENTO
  ) {
    return { cbteTipo: CBTE_TIPO.FACTURA_C, clase: 'C', label: 'FACTURA C' };
  }

  // Emisor Responsable Inscripto
  if (receptorCondicionId === CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO) {
    return { cbteTipo: CBTE_TIPO.FACTURA_A, clase: 'A', label: 'FACTURA A' };
  }

  return { cbteTipo: CBTE_TIPO.FACTURA_B, clase: 'B', label: 'FACTURA B' };
}

/**
 * Resuelve el cbteTipo a emitir. Siempre prevalece el determinado por emisor×receptor.
 * `school.facturacion.cbteTipo` es solo default legacy; no bloquea Factura A/C cuando corresponda.
 */
export function reconcileConfiguredCbteTipo(
  determined: CbteTipo,
  configured: number | undefined
): { ok: true; cbteTipo: CbteTipo; warning?: string } {
  if (configured != null && configured !== determined) {
    return {
      ok: true,
      cbteTipo: determined,
      warning: `Config náutica cbteTipo=${configured}; se emite tipo ${determined} según condición IVA del receptor.`,
    };
  }
  return { ok: true, cbteTipo: determined };
}
