/**
 * Normalización canónica de strings para matching de pagos/conciliación.
 * Única fuente de verdad: usada por src/lib/reconciliation y src/lib/reconciliacion-excel,
 * que antes tenían cada uno su propia copia de este mismo algoritmo.
 * - trim, uppercase
 * - eliminar tildes/diacríticos
 * - reemplazar signos/puntos/guiones por espacio
 * - colapsar espacios múltiples
 */
export function normalizeString(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
  const normalized = normalizeString(str);
  const tokens = tokenize(normalized);
  return { normalized, tokens };
}
