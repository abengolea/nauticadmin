/**
 * Utilidades para importar proveedores desde Excel (ej. listado contable).
 */

import type { ExpenseVendor } from './types';

export type VendorColumnMapping = {
  colCode: number;
  colName: number;
  colAddress: number;
  colCity: number;
  colProvince: number;
  colPostalCode: number;
  colIvaType: number;
  colDocType: number;
  colCuit: number;
  colCreditActive: number;
  colCreditDays: number;
};

export type ParsedVendorImport = {
  externalCode?: string;
  name: string;
  cuit?: string;
  vendorId: string;
  address?: string;
  ivaCondition?: string;
  cuentaCorrienteHabilitada?: boolean;
  creditDays?: number;
  docType?: string;
};

const HEADER_PATTERNS: Record<keyof VendorColumnMapping, RegExp> = {
  colCode: /^c[oó]digo$/i,
  colName: /raz[oó]n social|apellido nombres/i,
  colAddress: /^direcci[oó]n$/i,
  colCity: /^localidad$/i,
  colProvince: /^provincia$/i,
  colPostalCode: /c[oó]d\.?\s*postal|c[oó]digo postal/i,
  colIvaType: /tipo de iva|condici[oó]n.*iva/i,
  colCreditActive: /cr[eé]dito activo/i,
  colCreditDays: /d[ií]as de cr[eé]dito/i,
  colDocType: /tipo de documento/i,
  colCuit: /cuit/i,
};

const DEFAULT_MAPPING: VendorColumnMapping = {
  colCode: 0,
  colName: 1,
  colAddress: 2,
  colCity: 3,
  colProvince: 4,
  colPostalCode: 5,
  colIvaType: 7,
  colDocType: 8,
  colCuit: 9,
  colCreditActive: 10,
  colCreditDays: 11,
};

function cell(row: (string | number)[], index: number): string {
  const v = row[index];
  if (v == null) return '';
  return String(v).trim();
}

export function normalizeCuit(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return undefined;
  if (digits.length === 11) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
  }
  return raw.trim() || undefined;
}

export function vendorIdFromImport(
  cuit: string | undefined,
  externalCode: string | undefined,
  name: string
): string {
  const cuitDigits = cuit?.replace(/\D/g, '') ?? '';
  if (cuitDigits.length >= 10) return cuitDigits;
  if (externalCode) return `code-${externalCode}`;
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || `vendor-${Date.now()}`;
}

export function mapIvaCondition(raw: string): string | undefined {
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (/resp.*inscripto|respins/i.test(v)) return 'IVA Responsable Inscripto';
  if (/no inscripto/i.test(v)) return 'IVA Responsable no Inscripto';
  if (/exento/i.test(v)) return 'IVA Exento';
  if (/monotrib/i.test(v)) return 'Monotributista';
  if (/consumidor/i.test(v)) return 'Consumidor Final';
  return raw.trim();
}

export function findVendorHeaderRow(rows: (string | number)[][]): number {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const joined = row.map((c) => String(c ?? '').trim()).join('|').toLowerCase();
    if (
      /c[oó]digo/.test(joined) &&
      (/raz[oó]n social|apellido nombres/.test(joined) || /cuit/.test(joined))
    ) {
      return i;
    }
  }
  return 0;
}

export function detectVendorColumnMapping(headers: string[]): VendorColumnMapping {
  const mapping = { ...DEFAULT_MAPPING };
  const used = new Set<number>();

  const orderedKeys: (keyof VendorColumnMapping)[] = [
    'colCode',
    'colName',
    'colAddress',
    'colCity',
    'colProvince',
    'colPostalCode',
    'colIvaType',
    'colDocType',
    'colCuit',
    'colCreditActive',
    'colCreditDays',
  ];

  for (const key of orderedKeys) {
    const pattern = HEADER_PATTERNS[key];
    const idx = headers.findIndex((h, i) => !used.has(i) && pattern.test(h.trim()));
    if (idx >= 0) {
      mapping[key] = idx;
      used.add(idx);
    }
  }

  return mapping;
}

function buildAddress(parts: string[]): string | undefined {
  const joined = parts.filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
  return joined || undefined;
}

export function parseVendorImportRow(
  row: (string | number)[],
  mapping: VendorColumnMapping
): ParsedVendorImport | null {
  const name = cell(row, mapping.colName);
  if (!name) return null;

  const externalCode = cell(row, mapping.colCode) || undefined;
  const rawCuit = cell(row, mapping.colCuit);
  const docType = cell(row, mapping.colDocType) || undefined;
  const cuit =
    docType?.toUpperCase().includes('CUIT') || rawCuit.replace(/\D/g, '').length >= 10
      ? normalizeCuit(rawCuit)
      : undefined;

  const address = buildAddress([
    cell(row, mapping.colAddress),
    cell(row, mapping.colCity),
    cell(row, mapping.colProvince),
    cell(row, mapping.colPostalCode),
  ]);

  const creditActive = cell(row, mapping.colCreditActive).toUpperCase();
  const creditDaysRaw = cell(row, mapping.colCreditDays);
  const creditDays = creditDaysRaw ? parseInt(creditDaysRaw, 10) : undefined;

  return {
    externalCode,
    name: name.replace(/\s+/g, ' ').trim(),
    cuit,
    vendorId: vendorIdFromImport(cuit, externalCode, name),
    address,
    ivaCondition: mapIvaCondition(cell(row, mapping.colIvaType)),
    cuentaCorrienteHabilitada: creditActive ? creditActive.startsWith('S') : true,
    creditDays: creditDays && !Number.isNaN(creditDays) ? creditDays : undefined,
    docType,
  };
}

export function parseVendorImportRows(
  rows: (string | number)[][],
  mapping: VendorColumnMapping,
  headerRowIndex: number
): ParsedVendorImport[] {
  const dataRows = rows.slice(headerRowIndex + 1);
  const parsed: ParsedVendorImport[] = [];
  const seenIds = new Set<string>();

  for (const row of dataRows) {
    if (!Array.isArray(row)) continue;
    const vendor = parseVendorImportRow(row, mapping);
    if (!vendor) continue;
    if (seenIds.has(vendor.vendorId)) continue;
    seenIds.add(vendor.vendorId);
    parsed.push(vendor);
  }

  return parsed;
}

export function toExpenseVendorPayload(
  vendor: ParsedVendorImport,
  schoolId: string,
  now: string
): Omit<ExpenseVendor, 'id'> & { id: string } {
  return {
    id: vendor.vendorId,
    schoolId,
    name: vendor.name,
    cuit: vendor.cuit,
    address: vendor.address,
    ivaCondition: vendor.ivaCondition,
    cuentaCorrienteHabilitada: vendor.cuentaCorrienteHabilitada ?? true,
    externalCode: vendor.externalCode,
    creditDays: vendor.creditDays,
    createdAt: now,
    updatedAt: now,
  };
}
