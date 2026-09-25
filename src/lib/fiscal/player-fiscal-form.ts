/**
 * Validación fiscal compartida en formularios de cliente.
 */

import { z } from 'zod';
import { normalizeDigits, validateCuitChecksum } from './cuit';
import { condicionIvaRequiresCuit } from './receptor-doc';

export function refinePlayerFiscalFields(
  data: { condicionIVAId?: number; cuit?: string },
  ctx: z.RefinementCtx
): void {
  if (!condicionIvaRequiresCuit(data.condicionIVAId)) {
    return;
  }
  const digits = normalizeDigits(data.cuit);
  if (digits.length !== 11) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cuit'],
      message: 'Responsable Inscripto y otras condiciones similares exigen CUIT de 11 dígitos',
    });
    return;
  }
  if (!validateCuitChecksum(digits)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cuit'],
      message: 'CUIT inválido (revisá el dígito verificador)',
    });
  }
}
