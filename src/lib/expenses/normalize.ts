/**
 * Normalización de datos extraídos por IA:
 * - Números: "526.350,00" => 526350.00
 * - Fechas: dd/mm/yyyy => ISO
 * - CUIT: quitar guiones, validar dígito verificador
 */

/**
 * Convierte string numérico argentino/europeo a number.
 * Ej: "526.350,00" => 526350.00, "1.234,56" => 1234.56, "6.880" => 6880
 */
export function normalizeNumber(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isNaN(value) ? undefined : value;
  const str = String(value).trim();
  if (!str) return undefined;
  // Quitar espacios y caracteres no numéricos excepto . , -
  const cleaned = str.replace(/\s/g, '').replace(/[^\d.,\-]/g, '');
  // Formato argentino: 1.234,56 (punto miles, coma decimal) o 6.880 (punto miles, sin decimales)
  const hasCommaDecimal = /,\d{1,2}$/.test(cleaned) || /,\d+$/.test(cleaned);
  let normalized: string;
  if (hasCommaDecimal) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes('.')) {
    // Sin coma: "6.880" = 6880 (punto como miles). Si la parte tras el punto tiene 3 dígitos, es miles.
    const afterDot = cleaned.split('.').pop() ?? '';
    const isThousands = afterDot.length === 3 && /^\d+$/.test(afterDot);
    normalized = isThousands ? cleaned.replace(/\./g, '') : cleaned;
  } else {
    normalized = cleaned.replace(/,/g, '');
  }
  const num = parseFloat(normalized);
  return Number.isNaN(num) ? undefined : num;
}

/**
 * Convierte fecha dd/mm/yyyy o dd-mm-yyyy a ISO (YYYY-MM-DD).
 */
export function normalizeDate(value: string | undefined | null): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Ya en formato ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? undefined : trimmed.slice(0, 10);
  }
  // dd/mm/yyyy o dd-mm-yyyy
  const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const y = year.length === 2 ? (parseInt(year, 10) >= 50 ? `19${year}` : `20${year}`) : year;
  const m = month.padStart(2, '0');
  const d = day.padStart(2, '0');
  const iso = `${y}-${m}-${d}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : iso;
}

/** Dígitos del CUIT sin guiones (11 dígitos) */
const CUIT_DIGITS = 11;

/** Módulo para validación CUIT */
const CUIT_MOD = 11;

/**
 * Quita guiones y espacios del CUIT, deja solo dígitos.
 * Ej: "20-12345678-9" => "20123456789"
 */
export function normalizeCuit(value: string | undefined | null): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const digits = value.replace(/\D/g, '');
  return digits.length === CUIT_DIGITS ? digits : undefined;
}

/**
 * Valida el dígito verificador del CUIT (algoritmo estándar Argentina).
 * Retorna true si el CUIT es válido.
 */
export function validateCuitDigit(cuit: string): boolean {
  const digits = cuit.replace(/\D/g, '');
  if (digits.length !== CUIT_DIGITS) return false;
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]!, 10) * multipliers[i]!;
  }
  const remainder = sum % CUIT_MOD;
  const expected = remainder === 0 ? 0 : CUIT_MOD - remainder;
  const actual = parseInt(digits[10]!, 10);
  return expected === actual;
}

/**
 * Normaliza y valida CUIT. Retorna el CUIT formateado (con guiones) si es válido.
 */
export function normalizeAndValidateCuit(value: string | undefined | null): {
  raw: string;
  valid: boolean;
} | undefined {
  const raw = normalizeCuit(value);
  if (!raw) return undefined;
  return {
    raw: `${raw.slice(0, 2)}-${raw.slice(2, 10)}-${raw.slice(10)}`,
    valid: validateCuitDigit(raw),
  };
}
