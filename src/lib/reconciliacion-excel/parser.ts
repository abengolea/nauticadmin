/**
 * Parser de Excel/CSV para relaciones y pagos.
 * Excel: xlsx. CSV: papaparse.
 */

import * as XLSX from "xlsx";
import Papa from "papaparse";
import { parseAplicadaFlag } from "./impute-match";
import { normalizeAccount, normalizePayer } from "./normalize";
import type {
  ColumnMapping,
  PaymentFileKind,
  PaymentRow,
  RejectedPaymentRow,
  RelationRow,
} from "./types";

const RELATION_COL_PATTERNS = {
  account: ["ayb (cuenta)", "ayb", "cuenta", "columna a", "col a", "a+b"],
  payer: ["pagador (col g)", "pagador", "col g", "col 7", "columna g"],
};

function findColumnIndex(headers: string[], patterns: string[]): number {
  const lower = headers.map((h) => String(h ?? "").toLowerCase().trim());
  for (const p of patterns) {
    const idx = lower.findIndex((h) => h.includes(p) || p.includes(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseRowsFromFile(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const isCsv =
      file.name.toLowerCase().endsWith(".csv") ||
      file.type === "text/csv";

    if (isCsv) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          if (!text) {
            reject(new Error("No se pudo leer el archivo"));
            return;
          }
          const parsed = Papa.parse<string[]>(text, {
            header: false,
            skipEmptyLines: true,
          });
          const rows = parsed.data as string[][];
          if (!rows?.length) {
            reject(new Error("El archivo está vacío"));
            return;
          }
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Error al leer el archivo"));
      reader.readAsText(file, "UTF-8");
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            reject(new Error("No se pudo leer el archivo"));
            return;
          }
          const workbook = XLSX.read(data, { type: "binary" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]] ?? "";
          const json = XLSX.utils.sheet_to_json<(string | number)[]>(firstSheet, {
            header: 1,
            defval: "",
            raw: false,
          }) as (string | number)[][];
          const rows = json.map((row) =>
            row.map((c) => (c != null ? String(c).trim() : ""))
          );
          if (!rows.length) {
            reject(new Error("El archivo está vacío"));
            return;
          }
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Error al leer el archivo"));
      reader.readAsBinaryString(file);
    }
  });
}

export type ParseRelationsResult = {
  relations: RelationRow[];
  error?: string;
  preview: string[][];
  totalRows: number;
};

function looksLikePersonName(value: string): boolean {
  const t = value.trim();
  if (t.length < 2) return false;
  if (/^(dato opcional|ayb|pagador|importe|apellido|nombre|nro tarjeta|aplicada|observaciones)$/i.test(t)) {
    return false;
  }
  return /[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]{2,}/.test(t);
}

function looksLikeNumericCode(value: string): boolean {
  return /^\d{6,}$/.test(value.replace(/[.\s]/g, ""));
}

function looksLikeCardNumber(value: string): boolean {
  return value.replace(/\D/g, "").length >= 13;
}

function looksLikeAmount(value: string): boolean {
  const n = parseFloat(String(value ?? "").replace(/[^\d.,\-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0;
}

export function cardLast4(card: string): string {
  const digits = String(card ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

/** Listado Visa interno: sin encabezados, Apellido | Nombre | DNI | Tarjeta | Importe. */
export function isVisaListado(rows: string[][]): boolean {
  const sample = rows.slice(0, 8).filter((r) => (r[0] ?? "").trim() || (r[1] ?? "").trim());
  if (sample.length < 1) return false;
  let hits = 0;
  for (const row of sample) {
    if (
      looksLikePersonName(row[0] ?? "") &&
      looksLikePersonName(row[1] ?? "") &&
      looksLikeNumericCode(row[2] ?? "") &&
      looksLikeCardNumber(row[3] ?? "") &&
      looksLikeAmount(row[4] ?? "")
    ) {
      hits++;
    }
  }
  return hits >= Math.min(2, sample.length);
}

export function parseRelationsFromRows(
  rows: string[][],
  kind?: PaymentFileKind
): ParseRelationsResult {
  if (isVisaListado(rows)) {
    const now = new Date().toISOString();
    const relations: RelationRow[] = [];
    for (const row of rows) {
      const lastName = String(row[0] ?? "").trim();
      const firstName = String(row[1] ?? "").trim();
      const dni = String(row[2] ?? "").trim();
      const card = String(row[3] ?? "").trim();
      const imputeTo = String(row[6] ?? "").trim();
      const payerRaw = [lastName, firstName].filter(Boolean).join(" ");
      if (!payerRaw) continue;
      const label = imputeTo
        ? `${imputeTo} · DNI ${dni || "—"}`
        : `${payerRaw} · DNI ${dni || "—"}`;
      relations.push({
        accountKey: normalizeAccount(dni || payerRaw),
        payerKey: normalizePayer(payerRaw),
        payerRaw,
        accountRaw: label,
        createdAt: now,
        cardLast4: cardLast4(card) || undefined,
        kind,
        dni: dni || undefined,
        listadoLastName: lastName || undefined,
        listadoFirstName: firstName || undefined,
        imputeToRaw: imputeTo || undefined,
      });
    }
    return {
      relations,
      preview: rows.slice(0, 21),
      totalRows: rows.length,
    };
  }

  const headers = (rows[0] ?? []).map((h) => String(h ?? "").trim());
  const dataRows = rows.slice(1);
  const colAccount = findColumnIndex(headers, RELATION_COL_PATTERNS.account);
  const colPayer = findColumnIndex(headers, RELATION_COL_PATTERNS.payer);

  if (colAccount < 0) {
    return {
      relations: [],
      preview: rows.slice(0, 21),
      totalRows: rows.length,
      error: `No se encontró columna AYB (Cuenta). Buscadas: ${RELATION_COL_PATTERNS.account.join(", ")}`,
    };
  }
  if (colPayer < 0) {
    return {
      relations: [],
      preview: rows.slice(0, 21),
      totalRows: rows.length,
      error: `No se encontró columna Pagador. Buscadas: ${RELATION_COL_PATTERNS.payer.join(", ")}`,
    };
  }

  const relations: RelationRow[] = [];
  const now = new Date().toISOString();

  for (const row of dataRows) {
    const accountRaw = String(row[colAccount] ?? "").trim();
    const payerRaw = String(row[colPayer] ?? "").trim();
    if (!payerRaw) continue;
    relations.push({
      accountKey: normalizeAccount(accountRaw || " "),
      payerKey: normalizePayer(payerRaw),
      payerRaw,
      accountRaw: accountRaw || "—",
      createdAt: now,
      kind,
    });
  }

  return {
    relations,
    preview: rows.slice(0, 21),
    totalRows: rows.length,
  };
}

export async function parseRelationsFile(
  file: File,
  kind?: PaymentFileKind
): Promise<ParseRelationsResult> {
  const rows = await parseRowsFromFile(file);
  return parseRelationsFromRows(rows, kind);
}

export type ParsePaymentsResult = {
  payments: PaymentRow[];
  rejected: RejectedPaymentRow[];
  headers: string[];
  error?: string;
  preview: string[][];
  totalRows: number;
};

export function buildPaymentsFromRows(
  headers: string[],
  dataRows: string[][],
  mapping: ColumnMapping,
  kind: PaymentFileKind = "credit"
): { payments: PaymentRow[]; rejected: RejectedPaymentRow[]; error?: string } {
  const colLastName = mapping.lastName ? headers.indexOf(mapping.lastName) : -1;
  const colFirstName = mapping.firstName ? headers.indexOf(mapping.firstName) : -1;
  const colPayer = mapping.payer ? headers.indexOf(mapping.payer) : -1;
  const colAmount = headers.indexOf(mapping.amount);
  const colDate = mapping.date ? headers.indexOf(mapping.date) : -1;
  const colRef = mapping.reference ? headers.indexOf(mapping.reference) : -1;
  const hasSplitName = colLastName >= 0 || colFirstName >= 0;

  if (!hasSplitName && colPayer < 0) {
    return { payments: [], rejected: [], error: "Columna Pagador / Apellido no encontrada en el mapeo" };
  }
  if (colAmount < 0) {
    return { payments: [], rejected: [], error: "Columna Importe no encontrada en el mapeo" };
  }

  function parseAmount(val: unknown): number {
    if (val == null) return 0;
    if (typeof val === "number" && !Number.isNaN(val)) return val;
    const s = String(val).replace(/[^\d.,\-]/g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isNaN(n) ? 0 : n;
  }

  const extraCols = (mapping.extras ?? [])
    .filter((e) => e.label.trim() && e.column.trim())
    .map((e) => ({
      label: e.label.trim(),
      index: headers.indexOf(e.column),
    }))
    .filter((e) => e.index >= 0);

  const payments: PaymentRow[] = [];
  const rejected: RejectedPaymentRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] ?? [];
    const lastName = colLastName >= 0 ? String(row[colLastName] ?? "").trim() : "";
    const firstName = colFirstName >= 0 ? String(row[colFirstName] ?? "").trim() : "";
    const singlePayer = colPayer >= 0 ? String(row[colPayer] ?? "").trim() : "";
    const payerRaw = hasSplitName
      ? [lastName, firstName].filter(Boolean).join(" ")
      : singlePayer;
    if (!payerRaw) continue;
    const amount = parseAmount(row[colAmount]);
    const date = colDate >= 0 ? String(row[colDate] ?? "").trim() : "";
    const reference = colRef >= 0 ? String(row[colRef] ?? "").trim() : "";
    const extras: Record<string, string> = {};
    for (const extra of extraCols) {
      extras[extra.label] = String(row[extra.index] ?? "").trim();
    }

    if (parseAplicadaFlag(extras.Aplicada) === false) {
      rejected.push({
        payerRaw,
        amount,
        observaciones: reference || extras.Observaciones || "",
        kind,
      });
      continue;
    }

    payments.push({
      rowId: `${kind}-${i + 1}`,
      payerRaw,
      amount,
      date,
      reference,
      kind,
      extras,
    });
  }

  return { payments, rejected };
}

export async function parsePaymentsFile(
  file: File,
  mapping: ColumnMapping,
  kind: PaymentFileKind = "credit"
): Promise<ParsePaymentsResult> {
  const rows = await parseRowsFromFile(file);
  const headers = (rows[0] ?? []).map((h) => String(h ?? "").trim());
  const dataRows = rows.slice(1);
  const built = buildPaymentsFromRows(headers, dataRows, mapping, kind);

  return {
    payments: built.payments,
    rejected: built.rejected,
    headers,
    preview: rows.slice(0, 21),
    totalRows: rows.length,
    error: built.error,
  };
}

export function getHeadersFromFile(file: File): Promise<string[]> {
  return parseRowsFromFile(file).then((rows) =>
    (rows[0] ?? []).map((h) => String(h ?? "").trim())
  );
}

export async function getPaymentsFilePreview(file: File): Promise<{
  headers: string[];
  sampleRows: string[][];
  preview: string[][];
  totalRows: number;
}> {
  const rows = await parseRowsFromFile(file);
  const headers = (rows[0] ?? []).map((h) => String(h ?? "").trim());
  const dataRows = rows.slice(1);
  return {
    headers,
    sampleRows: dataRows.slice(0, 5),
    preview: rows.slice(0, 21),
    totalRows: rows.length,
  };
}
