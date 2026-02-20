/**
 * Normalización de nombres para matching.
 * Funciones puras, sin efectos secundarios.
 */

/**
 * Normaliza un string de nombre para comparación.
 * - trim, uppercase
 * - eliminar tildes/diacríticos
 * - reemplazar signos/puntos/guiones por espacio
 * - colapsar espacios múltiples
 */
export function normalizeName(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:\-_/\\()\[\]{}'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokeniza un string normalizado: split por espacios y filtra vacíos.
 */
export function tokenize(normalized: string): string[] {
  if (typeof normalized !== 'string') return [];
  return normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Normaliza y tokeniza en un solo paso.
 */
export function normalizeAndTokenize(str: string): { normalized: string; tokens: string[] } {
  const normalized = normalizeName(str);
  const tokens = tokenize(normalized);
  return { normalized, tokens };
}
