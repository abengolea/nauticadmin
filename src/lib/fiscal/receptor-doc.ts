/**
 * Resolución y validación cruzada documento receptor × condición IVA.
 */

import { DOC_TIPO, type CondicionIvaReceptorId } from './constants';
import { CONDICION_IVA_RECEPTOR } from './constants';
import { normalizeDigits, isPseudoCuitFromDni, validateCuitChecksum, formatCuitDisplay } from './cuit';

export interface ReceptorDocument {
  docTipo: number;
  docNro: number;
  /** Para PDF/display */
  docDisplay: string;
}

export type ReceptorDocError =
  | { code: 'missing'; message: string }
  | { code: 'invalid'; message: string }
  | { code: 'inconsistent'; message: string };

const REQUIRES_CUIT: CondicionIvaReceptorId[] = [
  CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO,
  CONDICION_IVA_RECEPTOR.RESPONSABLE_MONOTRIBUTO,
  CONDICION_IVA_RECEPTOR.IVA_SUJETO_EXENTO,
  CONDICION_IVA_RECEPTOR.IVA_NO_ALCANZADO,
  CONDICION_IVA_RECEPTOR.MONOTRIBUTISTA_SOCIAL,
  CONDICION_IVA_RECEPTOR.MONOTRIBUTO_TII,
];

export function condicionIvaRequiresCuit(
  condicionIvaId: number | undefined | null
): condicionIvaId is CondicionIvaReceptorId {
  return (
    condicionIvaId != null &&
    REQUIRES_CUIT.includes(condicionIvaId as CondicionIvaReceptorId)
  );
}

/**
 * Resuelve documento receptor para emisión real (no simulación).
 */
export function validateDocNroNotEmisor(
  docNro: number,
  emisorCuit: string | undefined
): ReceptorDocError | null {
  if (docNro <= 0 || !emisorCuit) return null;
  const emisorDigits = normalizeDigits(emisorCuit);
  if (emisorDigits.length === 11 && docNro === parseInt(emisorDigits, 10)) {
    return {
      code: 'inconsistent',
      message:
        'El CUIT del cliente coincide con el CUIT emisor de la náutica (AFIP 10069). Corregí el CUIT en el perfil del cliente.',
    };
  }
  return null;
}

export function resolveReceptorDocument(
  player: { cuit?: string; dni?: string } | null,
  condicionIvaId: CondicionIvaReceptorId,
  options?: { emisorCuit?: string }
): ReceptorDocument | ReceptorDocError {
  const cuitDigits = normalizeDigits(player?.cuit);
  const dniDigits = normalizeDigits(player?.dni);

  if (cuitDigits.length === 11 && !isPseudoCuitFromDni(cuitDigits)) {
    if (!validateCuitChecksum(cuitDigits)) {
      return { code: 'invalid', message: 'CUIT inválido (dígito verificador incorrecto)' };
    }
    const doc: ReceptorDocument = {
      docTipo: DOC_TIPO.CUIT,
      docNro: parseInt(cuitDigits, 10),
      docDisplay: formatCuitDisplay(cuitDigits),
    };
    return finalizeReceptorDoc(doc, condicionIvaId, options?.emisorCuit);
  }

  if (dniDigits.length === 8) {
    const doc: ReceptorDocument = {
      docTipo: DOC_TIPO.DNI,
      docNro: parseInt(dniDigits, 10),
      docDisplay: dniDigits,
    };
    return finalizeReceptorDoc(doc, condicionIvaId, options?.emisorCuit);
  }

  if (cuitDigits.length === 11 && isPseudoCuitFromDni(cuitDigits)) {
    const dniFromPseudo = cuitDigits.slice(2, 10);
    const doc: ReceptorDocument = {
      docTipo: DOC_TIPO.DNI,
      docNro: parseInt(dniFromPseudo, 10),
      docDisplay: dniFromPseudo,
    };
    return finalizeReceptorDoc(doc, condicionIvaId, options?.emisorCuit);
  }

  if (REQUIRES_CUIT.includes(condicionIvaId)) {
    return {
      code: 'missing',
      message: 'Esta condición IVA exige CUIT válido de 11 dígitos',
    };
  }

  if (condicionIvaId === CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL) {
    return {
      docTipo: DOC_TIPO.SIN_IDENTIFICAR,
      docNro: 0,
      docDisplay: 'Consumidor Final',
    };
  }

  if (cuitDigits.length > 0 || dniDigits.length > 0) {
    return { code: 'invalid', message: 'CUIT (11 dígitos) o DNI (8 dígitos) inválido' };
  }

  return { code: 'missing', message: 'Falta CUIT o DNI del cliente' };
}

function validateDocCondicionConsistency(
  doc: ReceptorDocument,
  condicionIvaId: CondicionIvaReceptorId
): ReceptorDocument | ReceptorDocError {
  if (REQUIRES_CUIT.includes(condicionIvaId) && doc.docTipo !== DOC_TIPO.CUIT) {
    return {
      code: 'inconsistent',
      message: `La condición IVA seleccionada exige CUIT; no se puede emitir con DNI (DocTipo ${doc.docTipo})`,
    };
  }
  if (
    condicionIvaId === CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO &&
    doc.docTipo === DOC_TIPO.DNI
  ) {
    return {
      code: 'inconsistent',
      message: 'Responsable Inscripto no puede facturarse con DNI — cargá el CUIT del cliente',
    };
  }
  return doc;
}

function finalizeReceptorDoc(
  doc: ReceptorDocument,
  condicionIvaId: CondicionIvaReceptorId,
  emisorCuit?: string
): ReceptorDocument | ReceptorDocError {
  const consistency = validateDocCondicionConsistency(doc, condicionIvaId);
  if ('code' in consistency) return consistency;
  const emisorCheck = validateDocNroNotEmisor(consistency.docNro, emisorCuit);
  if (emisorCheck) return emisorCheck;
  return consistency;
}

/** Documento ficticio para preview/simulación (no persiste como factura real). */
export function resolveReceptorDocumentSimulation(
  player: { cuit?: string; dni?: string; firstName?: string; lastName?: string } | null
): ReceptorDocument {
  const resolved = resolveReceptorDocument(player, CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL);
  if ('code' in resolved) {
    return { docTipo: DOC_TIPO.SIN_IDENTIFICAR, docNro: 0, docDisplay: 'Consumidor Final (simulación)' };
  }
  return resolved;
}
