/**
 * Parser de Excel/CSV para relaciones y pagos.
 * Excel: xlsx. CSV: papaparse.
 */

import * as XLSX from "xlsx";
import Papa from "papaparse";
import { normalizeAccount, normalizePayer } from "./normalize";
import type { RelationRow, PaymentRow } from "./types";

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

export async function parseRelationsFile(file: File): Promise<ParseRelationsResult> {
  const rows = await parseRowsFromFile(file);
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

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] ?? [];
    const accountRaw = String(row[colAccount] ?? "").trim();
    const payerRaw = String(row[colPayer] ?? "").trim();
    if (!payerRaw) continue;

    const accountKey = normalizeAccount(accountRaw || " ");
    const payerKey = normalizePayer(payerRaw);

    relations.push({
      accountKey,
      payerKey,
      payerRaw,
      accountRaw: accountRaw || "—",
      createdAt: now,
    });
  }

  return {
    relations,
    preview: rows.slice(0, 21),
    totalRows: rows.length,
  };
}

export type ParsePaymentsResult = {
  payments: PaymentRow[];
  headers: string[];
  error?: string;
  preview: string[][];
  totalRows: number;
};

export async function parsePaymentsFile(
  file: File,
  mapping: { payer: string; amount: string; date: string; reference: string }
): Promise<ParsePaymentsResult> {
  const rows = await parseRowsFromFile(file);
  const headers = (rows[0] ?? []).map((h) => String(h ?? "").trim());
  const dataRows = rows.slice(1);

  const colPayer = headers.indexOf(mapping.payer);
  const colAmount = headers.indexOf(mapping.amount);
  const colDate = mapping.date ? headers.indexOf(mapping.date) : -1;
  const colRef = mapping.reference ? headers.indexOf(mapping.reference) : -1;

  if (colPayer < 0) {
    return {
      payments: [],
      headers,
      preview: rows.slice(0, 21),
      totalRows: rows.length,
      error: "Columna Pagador no encontrada en el mapeo",
    };
  }
  if (colAmount < 0) {
    return {
      payments: [],
      headers,
      preview: rows.slice(0, 21),
      totalRows: rows.length,
      error: "Columna Monto no encontrada en el mapeo",
    };
  }

  function parseAmount(val: unknown): number {
    if (val == null) return 0;
    if (typeof val === "number" && !Number.isNaN(val)) return val;
    const s = String(val).replace(/[^\d.,\-]/g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isNaN(n) ? 0 : n;
  }

  const payments: PaymentRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] ?? [];
    const payerRaw = String(row[colPayer] ?? "").trim();
    const amount = parseAmount(row[colAmount]);
    const date = colDate >= 0 ? String(row[colDate] ?? "").trim() : "";
    const reference = colRef >= 0 ? String(row[colRef] ?? "").trim() : "";

    payments.push({
      rowId: `pay-${i + 1}`,
      payerRaw,
      amount,
      date,
      reference,
    });
  }

  return {
    payments,
    headers,
    preview: rows.slice(0, 21),
    totalRows: rows.length,
  };
}

export function getHeadersFromFile(file: File): Promise<string[]> {
  return parseRowsFromFile(file).then((rows) =>
    (rows[0] ?? []).map((h) => String(h ?? "").trim())
  );
}
