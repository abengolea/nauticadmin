/**
 * Parsing de Excel para conciliación.
 * Detecta columnas por nombre y extrae datos.
 */

import type { ParsedClientRow, ParsedPaymentRow } from './types';

const CLIENT_COL_NAMES = [
  'apellido nombres',
  'apellido nombres//razón social',
  'razon social',
  'nombre',
  'cliente',
];

const PAYMENT_COLS = {
  dato1: ['dato opcional 1', 'apellido', 'dato 1'],
  dato2: ['dato opcional 2', 'nombre', 'dato 2'],
  idUsuario: ['id usuario', 'idusuario', 'id_usuario'],
  nroTarjeta: ['nro tarjeta', 'tarjeta', 'nrotarjeta'],
  importe: ['importe', 'monto', 'amount'],
  aplicada: ['aplicada', 'aplicado'],
  observaciones: ['observaciones', 'obs'],
};

function findColumnIndex(headers: string[], patterns: string[]): number {
  const lower = headers.map((h) => String(h ?? '').toLowerCase().trim());
  for (const p of patterns) {
    const idx = lower.findIndex((h) => h.includes(p) || p.includes(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseAplicada(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  const s = String(val).toLowerCase().trim();
  return ['sí', 'si', 'yes', 'true', '1', 's', 'x'].includes(s);
}

function parseAmount(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const v = val;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v).replace(/[^\d.,\-]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Parsea Excel de clientes. Columna principal: Apellido Nombres o Razón Social.
 */
export function parseClientsExcel(
  rows: (string | number)[][]
): { clients: ParsedClientRow[]; error?: string } {
  if (!rows || rows.length === 0) {
    return { clients: [], error: 'El archivo está vacío' };
  }
  const headers = (rows[0] ?? []).map((h) => String(h ?? '').trim());
  const dataRows = rows.slice(1);
  const colIdx = findColumnIndex(headers, CLIENT_COL_NAMES);
  if (colIdx < 0) {
    return {
      clients: [],
      error: `No se encontró columna de cliente. Buscadas: ${CLIENT_COL_NAMES.join(', ')}`,
    };
  }
  const clients: ParsedClientRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] ?? [];
    const fullName = String(row[colIdx] ?? '').trim();
    if (fullName) {
      clients.push({ full_name_raw: fullName, row_index: i + 1 });
    }
  }
  return { clients };
}

/**
 * Parsea Excel de pagos.
 */
export function parsePaymentsExcel(
  rows: (string | number)[][]
): { payments: ParsedPaymentRow[]; error?: string } {
  if (!rows || rows.length === 0) {
    return { payments: [], error: 'El archivo está vacío' };
  }
  const headers = (rows[0] ?? []).map((h) => String(h ?? '').trim());
  const dataRows = rows.slice(1);

  const colDato1 = findColumnIndex(headers, PAYMENT_COLS.dato1);
  const colDato2 = findColumnIndex(headers, PAYMENT_COLS.dato2);
  const colIdUsuario = findColumnIndex(headers, PAYMENT_COLS.idUsuario);
  const colImporte = findColumnIndex(headers, PAYMENT_COLS.importe);
  const colAplicada = findColumnIndex(headers, PAYMENT_COLS.aplicada);

  if (colDato1 < 0 && colDato2 < 0) {
    return { payments: [], error: 'No se encontró columna Dato Opcional 1 o 2' };
  }
  if (colImporte < 0) {
    return { payments: [], error: 'No se encontró columna Importe' };
  }

  const colNroTarjeta = findColumnIndex(headers, PAYMENT_COLS.nroTarjeta);
  const colObs = findColumnIndex(headers, PAYMENT_COLS.observaciones);

  const payments: ParsedPaymentRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] ?? [];
    const dato1 = colDato1 >= 0 ? String(row[colDato1] ?? '').trim() : '';
    const dato2 = colDato2 >= 0 ? String(row[colDato2] ?? '').trim() : '';
    const idUsuario = colIdUsuario >= 0 ? String(row[colIdUsuario] ?? '').trim() : '';
    const nroTarjeta = colNroTarjeta >= 0 ? String(row[colNroTarjeta] ?? '').trim() : '';
    const importe = parseAmount(row[colImporte]);
    const aplicada = colAplicada >= 0 ? parseAplicada(row[colAplicada]) : false;
    const observaciones = colObs >= 0 ? String(row[colObs] ?? '').trim() : '';

    payments.push({
      dato_opcional_1: dato1,
      dato_opcional_2: dato2,
      id_usuario: idUsuario,
      nro_tarjeta: nroTarjeta,
      importe,
      aplicada,
      observaciones,
      row_index: i + 1,
    });
  }
  return { payments };
}
