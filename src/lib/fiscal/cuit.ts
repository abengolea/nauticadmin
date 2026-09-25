/**
 * Validación estructural de CUIT/CUIL (11 dígitos + dígito verificador AFIP).
 */

export function normalizeDigits(value: string | undefined | null): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** Pseudo-CUIT 20-DNI-0 usado solo para display; no es CUIT válido en AFIP. */
export function isPseudoCuitFromDni(digits: string): boolean {
  return /^20\d{8}0$/.test(digits);
}

export function validateCuitChecksum(cuit: string): boolean {
  const d = normalizeDigits(cuit);
  if (d.length !== 11) return false;
  if (isPseudoCuitFromDni(d)) return false;

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(d[i]!, 10) * weights[i]!;
  }
  const mod = sum % 11;
  const check = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;
  return check === parseInt(d[10]!, 10);
}

export function formatCuitDisplay(cuit: string): string {
  const d = normalizeDigits(cuit);
  if (d.length !== 11) return cuit;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}
