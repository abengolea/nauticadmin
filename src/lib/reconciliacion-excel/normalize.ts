/**
 * Normalización de strings para matching.
 * - trim, uppercase
 * - eliminar tildes/diacríticos
 * - reemplazar signos/puntos/guiones por espacio
 * - colapsar espacios múltiples
 */

export function normalizeString(str: string): string {
  if (typeof str !== "string") return "";
  return str
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:\-_/\\()\[\]{}'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAccount(account: string): string {
  return normalizeString(account);
}

export function normalizePayer(payer: string): string {
  return normalizeString(payer);
}
