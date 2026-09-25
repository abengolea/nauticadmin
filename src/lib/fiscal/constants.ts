/**
 * Constantes fiscales WSFEv1 — Manual ARCA RG 4291 FE v4.8 (Sep 2026).
 * @see https://www.arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf
 */

/** Manual de referencia técnica utilizado por el módulo fiscal. */
export const WSFE_MANUAL_VERSION = '4.8';
export const WSFE_MANUAL_DATE = '2026-09-01';

/** Tipos de comprobante WSFE (FEParamGetTiposCbte). */
export const CBTE_TIPO = {
  FACTURA_A: 1,
  FACTURA_B: 6,
  FACTURA_C: 11,
} as const;

export type CbteTipo = (typeof CBTE_TIPO)[keyof typeof CBTE_TIPO];

/** Clase de comprobante para validación CondicionIVA × Cmp_Clase. */
export type VoucherClass = 'A' | 'B' | 'C' | 'M';

/** Tipos de documento receptor (FEParamGetTiposDoc). */
export const DOC_TIPO = {
  CUIT: 80,
  CUIL: 86,
  CDI: 87,
  DNI: 96,
  SIN_IDENTIFICAR: 99,
} as const;

/** Condición frente al IVA del receptor — FEParamGetCondicionIvaReceptor (RG 5616). */
export const CONDICION_IVA_RECEPTOR = {
  IVA_RESPONSABLE_INSCRIPTO: 1,
  IVA_SUJETO_EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  RESPONSABLE_MONOTRIBUTO: 6,
  SUJETO_NO_CATEGORIZADO: 7,
  PROVEEDOR_EXTERIOR: 8,
  CLIENTE_EXTERIOR: 9,
  IVA_LIBERADO: 10,
  MONOTRIBUTISTA_SOCIAL: 13,
  IVA_NO_ALCANZADO: 15,
  MONOTRIBUTO_TII: 16,
} as const;

export type CondicionIvaReceptorId =
  (typeof CONDICION_IVA_RECEPTOR)[keyof typeof CONDICION_IVA_RECEPTOR];

/** Condición IVA del emisor (configuración náutica). */
export const CONDICION_IVA_EMISOR = {
  RESPONSABLE_INSCRIPTO: 'responsable_inscripto',
  MONOTRIBUTISTA: 'monotributista',
  EXENTO: 'exento',
} as const;

export type CondicionIvaEmisor =
  (typeof CONDICION_IVA_EMISOR)[keyof typeof CONDICION_IVA_EMISOR];

/** Alicuota IVA 21% (FEParamGetTiposIva Id 5). */
export const ALICUOTA_IVA_21 = 5;

export const MONEDA = {
  PES: 'PES',
  DOL: 'DOL',
} as const;

export type FacturacionModo = 'real' | 'simulacion' | 'manual';

export const CONDICION_IVA_RECEPTOR_LABELS: Record<CondicionIvaReceptorId, string> = {
  [CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO]: 'IVA Responsable Inscripto',
  [CONDICION_IVA_RECEPTOR.IVA_SUJETO_EXENTO]: 'IVA Sujeto Exento',
  [CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL]: 'Consumidor Final',
  [CONDICION_IVA_RECEPTOR.RESPONSABLE_MONOTRIBUTO]: 'Responsable Monotributo',
  [CONDICION_IVA_RECEPTOR.SUJETO_NO_CATEGORIZADO]: 'Sujeto No Categorizado',
  [CONDICION_IVA_RECEPTOR.PROVEEDOR_EXTERIOR]: 'Proveedor del Exterior',
  [CONDICION_IVA_RECEPTOR.CLIENTE_EXTERIOR]: 'Cliente del Exterior',
  [CONDICION_IVA_RECEPTOR.IVA_LIBERADO]: 'IVA Liberado – Ley 19.640',
  [CONDICION_IVA_RECEPTOR.MONOTRIBUTISTA_SOCIAL]: 'Monotributista Social',
  [CONDICION_IVA_RECEPTOR.IVA_NO_ALCANZADO]: 'IVA No Alcanzado',
  [CONDICION_IVA_RECEPTOR.MONOTRIBUTO_TII]: 'Monotributo Trabajador Independiente Promovido',
};
