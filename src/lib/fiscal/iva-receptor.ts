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

/** Clases oficiales FEParamGetCondicionIvaReceptor (RG 5616). */
export const DEFAULT_CMP_CLASE_BY_CONDICION: Record<CondicionIvaReceptorId, string> = {
  [CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO]: 'A/M/C',
  [CONDICION_IVA_RECEPTOR.IVA_SUJETO_EXENTO]: 'B/C',
  [CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL]: 'B/C',
  [CONDICION_IVA_RECEPTOR.RESPONSABLE_MONOTRIBUTO]: 'A/M/C',
  [CONDICION_IVA_RECEPTOR.SUJETO_NO_CATEGORIZADO]: 'B/C',
  [CONDICION_IVA_RECEPTOR.PROVEEDOR_EXTERIOR]: 'B/C',
  [CONDICION_IVA_RECEPTOR.CLIENTE_EXTERIOR]: 'B/C',
  [CONDICION_IVA_RECEPTOR.IVA_LIBERADO]: 'B/C',
  [CONDICION_IVA_RECEPTOR.MONOTRIBUTISTA_SOCIAL]: 'A/M/C',
  [CONDICION_IVA_RECEPTOR.IVA_NO_ALCANZADO]: 'B/C',
  [CONDICION_IVA_RECEPTOR.MONOTRIBUTO_TII]: 'A/M/C',
};

const KNOWN_VOUCHER_CLASSES = new Set<VoucherClass>(['A', 'B', 'C', 'M']);

/** Parsea Cmp_Clase ("B/C", "A,M,C", filas duplicadas, etc.). */
export function parseCmpClasses(raw?: string): VoucherClass[] {
  if (!raw) return [];
  return raw
    .split(/[\/,\s|;.-]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is VoucherClass => KNOWN_VOUCHER_CLASSES.has(c as VoucherClass));
}

/** Une Cmp_Clase de todas las filas del mismo Id (ARCA a veces devuelve una por clase). */
export function allowedClassesForCondicion(
  condicionId: CondicionIvaReceptorId,
  paramTable?: CondicionIvaReceptorParam[]
): VoucherClass[] {
  const fromTable = [...new Set(
    (paramTable ?? [])
      .filter((r) => r.Id === condicionId)
      .flatMap((r) => parseCmpClasses(r.Cmp_Clase))
  )];
  if (fromTable.length > 0) return fromTable;
  return parseCmpClasses(DEFAULT_CMP_CLASE_BY_CONDICION[condicionId]);
}

/** Valida CondicionIVAReceptorId contra tabla paramétrica ARCA (Cmp_Clase). */
export function validateCondicionForVoucherClass(
  condicionId: CondicionIvaReceptorId,
  voucherClass: VoucherClass,
  paramTable: CondicionIvaReceptorParam[]
): { ok: true } | { ok: false; error: string } {
  const rows = paramTable.filter((r) => r.Id === condicionId);
  const official = parseCmpClasses(DEFAULT_CMP_CLASE_BY_CONDICION[condicionId]);

  if (rows.length === 0) {
    if (official.includes(voucherClass)) return { ok: true };
    return {
      ok: false,
      error: `Condición IVA receptor ${condicionId} no existe en FEParamGetCondicionIvaReceptor`,
    };
  }

  const classes = [...new Set(rows.flatMap((r) => parseCmpClasses(r.Cmp_Clase)))];
  // Tabla prefiltrada por clase: sin Cmp_Clase, el Id ya es válido para esa consulta.
  if (classes.length === 0 || classes.includes(voucherClass)) {
    return { ok: true };
  }
  // ARCA a veces manda una sola letra (p.ej. "C") aunque el oficial sea B/C.
  if (official.includes(voucherClass)) {
    return { ok: true };
  }

  const row = rows[0]!;
  return {
    ok: false,
    error: `"${row.Desc}" (id ${condicionId}) no es válida para comprobante clase ${voucherClass}. Clases permitidas: ${classes.join(', ')}`,
  };
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
