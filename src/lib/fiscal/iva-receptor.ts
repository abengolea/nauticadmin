/**
 * Condición IVA receptor — RG 5616 / FEParamGetCondicionIvaReceptor.
 */

import {
  CONDICION_IVA_RECEPTOR,
  CONDICION_IVA_RECEPTOR_LABELS,
  type CondicionIvaReceptorId,
  type VoucherClass,
} from './constants';

export interface CondicionIvaReceptorParam {
  Id: number;
  Desc: string;
  Cmp_Clase?: string;
}

/** Mapeo legacy string → id. Sin default silencioso a CF. */
const LEGACY_STRING_TO_ID: Record<string, CondicionIvaReceptorId> = {
  'responsable inscripto': CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO,
  'iva responsable inscripto': CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO,
  monotributista: CONDICION_IVA_RECEPTOR.RESPONSABLE_MONOTRIBUTO,
  'responsable monotributo': CONDICION_IVA_RECEPTOR.RESPONSABLE_MONOTRIBUTO,
  'consumidor final': CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
  exento: CONDICION_IVA_RECEPTOR.IVA_SUJETO_EXENTO,
  'iva sujeto exento': CONDICION_IVA_RECEPTOR.IVA_SUJETO_EXENTO,
  'iva no alcanzado': CONDICION_IVA_RECEPTOR.IVA_NO_ALCANZADO,
  'sujeto no categorizado': CONDICION_IVA_RECEPTOR.SUJETO_NO_CATEGORIZADO,
};

export function parseCondicionIvaReceptorId(
  rawId: unknown,
  rawLabel?: unknown
): CondicionIvaReceptorId | null {
  if (typeof rawId === 'number' && isValidCondicionIvaId(rawId)) {
    return rawId as CondicionIvaReceptorId;
  }
  if (typeof rawLabel === 'string' && rawLabel.trim()) {
    const key = rawLabel.trim().toLowerCase();
    if (key in LEGACY_STRING_TO_ID) return LEGACY_STRING_TO_ID[key]!;
  }
  return null;
}

export function isValidCondicionIvaId(id: number): id is CondicionIvaReceptorId {
  return id in CONDICION_IVA_RECEPTOR_LABELS;
}

export function getCondicionIvaLabel(id: CondicionIvaReceptorId): string {
  return CONDICION_IVA_RECEPTOR_LABELS[id];
}

export function voucherClassFromCbteTipo(cbteTipo: number): VoucherClass {
  if (cbteTipo === 1 || cbteTipo === 51 || cbteTipo === 52) return 'A';
  if (cbteTipo === 11 || cbteTipo === 12 || cbteTipo === 13 || cbteTipo === 15) return 'C';
  return 'B';
}

/** Valida CondicionIVAReceptorId contra tabla paramétrica ARCA (Cmp_Clase). */
export function validateCondicionForVoucherClass(
  condicionId: CondicionIvaReceptorId,
  voucherClass: VoucherClass,
  paramTable: CondicionIvaReceptorParam[]
): { ok: true } | { ok: false; error: string } {
  const row = paramTable.find((r) => r.Id === condicionId);
  if (!row) {
    return {
      ok: false,
      error: `Condición IVA receptor ${condicionId} no existe en FEParamGetCondicionIvaReceptor`,
    };
  }
  const classes = (row.Cmp_Clase ?? '')
    .split(/[\/,]/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (classes.length > 0 && !classes.includes(voucherClass)) {
    return {
      ok: false,
      error: `"${row.Desc}" (id ${condicionId}) no es válida para comprobante clase ${voucherClass}. Clases permitidas: ${classes.join(', ')}`,
    };
  }
  return { ok: true };
}

/** Opciones para selects de UI (ids canónicos). */
export const CONDICION_IVA_UI_OPTIONS: Array<{ id: CondicionIvaReceptorId; label: string }> = [
  { id: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL, label: 'Consumidor Final' },
  { id: CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO, label: 'IVA Responsable Inscripto' },
  { id: CONDICION_IVA_RECEPTOR.RESPONSABLE_MONOTRIBUTO, label: 'Responsable Monotributo' },
  { id: CONDICION_IVA_RECEPTOR.IVA_SUJETO_EXENTO, label: 'IVA Sujeto Exento' },
  { id: CONDICION_IVA_RECEPTOR.IVA_NO_ALCANZADO, label: 'IVA No Alcanzado' },
  { id: CONDICION_IVA_RECEPTOR.SUJETO_NO_CATEGORIZADO, label: 'Sujeto No Categorizado' },
];
