/**
 * Simula conciliación + imputación Visa desde archivos Excel locales.
 *
 * Uso (mínimo: listado + rendición crédito):
 *   SCHOOL_ID=xxx PERIOD=2026-09 \
 *   LISTADO_CREDITO=./9\ VISA\ CREDITO\ SEPTIEMBRE\ 2026.xlsx \
 *   RENDICION_CREDITO=./rendicion-credito.xlsx \
 *   npx tsx scripts/simulate-visa-reconciliation.ts
 *
 * Opcional débito:
 *   LISTADO_DEBITO=... RENDICION_DEBITO=...
 *
 * Requiere service-account.json o GOOGLE_APPLICATION_CREDENTIALS.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import * as XLSX from "xlsx";
import * as admin from "firebase-admin";
import { detectColumnMapping } from "../src/lib/reconciliacion-excel/column-mapping";
import {
  parseRelationsFromRows,
  buildPaymentsFromRows,
} from "../src/lib/reconciliacion-excel/parser";
import { runReconciliation } from "../src/lib/reconciliacion-excel/reconcile";
import { runImputePlan } from "../src/lib/reconciliacion-excel/impute-run";
import { RENDICION_DA_HEADERS } from "../src/lib/reconciliacion-excel/types";
import type { ImputePaymentItem, RelationRow, PaymentRow } from "../src/lib/reconciliacion-excel/types";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

const SCHOOL_ID = process.env.SCHOOL_ID?.trim();
const PERIOD = process.env.PERIOD?.trim() ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

function readXlsx(filePath: string): string[][] {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`No existe: ${abs}`);
  const wb = XLSX.readFile(abs);
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  const json = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  return json.map((row) => row.map((c) => (c != null ? String(c).trim() : "")));
}

function loadListado(filePath: string, kind: "credit" | "debit"): RelationRow[] {
  const rows = readXlsx(filePath);
  const { relations, error } = parseRelationsFromRows(rows, kind);
  if (error) throw new Error(`${filePath}: ${error}`);
  return relations;
}

function loadRendicion(filePath: string, kind: "credit" | "debit"): { payments: PaymentRow[]; rejected: number } {
  const rows = readXlsx(filePath);
  const headers = (rows[0] ?? []).map((h) => String(h ?? "").trim());
  const dataRows = rows.slice(1);
  const mapping = detectColumnMapping(headers.length ? headers : [...RENDICION_DA_HEADERS]);
  const { payments, rejected } = buildPaymentsFromRows(headers, dataRows, mapping, kind);
  return { payments, rejected: rejected.length };
}

function initDb(): admin.firestore.Firestore {
  if (admin.apps.length) return admin.firestore();
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ??
    (fs.existsSync("service-account.json") ? "service-account.json" : "");
  if (!credPath) throw new Error("Falta GOOGLE_APPLICATION_CREDENTIALS o service-account.json");
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(credPath, "utf8"))),
  });
  return admin.firestore();
}

async function main() {
  if (!SCHOOL_ID) throw new Error("Falta SCHOOL_ID");
  if (!/^\d{4}-\d{2}$/.test(PERIOD)) throw new Error("PERIOD inválido (YYYY-MM)");

  const relations: RelationRow[] = [];
  const payments: PaymentRow[] = [];
  let rejectedTotal = 0;

  const pairs: Array<{ listado: string | undefined; rendicion: string | undefined; kind: "credit" | "debit" }> = [
    { listado: process.env.LISTADO_CREDITO, rendicion: process.env.RENDICION_CREDITO, kind: "credit" },
    { listado: process.env.LISTADO_DEBITO, rendicion: process.env.RENDICION_DEBITO, kind: "debit" },
  ];

  for (const { listado, rendicion, kind } of pairs) {
    if (listado) relations.push(...loadListado(listado, kind));
    if (rendicion) {
      const { payments: p, rejected } = loadRendicion(rendicion, kind);
      payments.push(...p);
      rejectedTotal += rejected;
    }
  }

  if (relations.length === 0) throw new Error("Cargá al menos un listado (LISTADO_CREDITO o LISTADO_DEBITO)");
  if (payments.length === 0) throw new Error("Cargá al menos una rendición (RENDICION_CREDITO o RENDICION_DEBITO)");

  const results = runReconciliation(relations, payments);
  const matched = results.filter((r) => r.status === "MATCHED");

  const items: ImputePaymentItem[] = matched.map((r) => ({
    paymentRowId: r.paymentRowId,
    payerRaw: r.payerRaw,
    amount: r.amount ?? 0,
    accountKey: r.matchedAccountKey!,
    accountRaw:
      relations.find((rel) => rel.accountKey === r.matchedAccountKey)?.accountRaw ??
      r.matchedAccountKey!,
    sourceKind: r.sourceKind,
    aplicada: r.aplicada,
    cardLast4: r.cardLast4,
  }));

  const db = initDb();
  const sim = await runImputePlan(db, {
    schoolId: SCHOOL_ID,
    items,
    period: PERIOD,
    simulate: true,
  });

  console.log("\n=== Conciliación ===");
  console.log(`Listado: ${relations.length} filas`);
  console.log(`Rendición: ${payments.length} aplicadas, ${rejectedTotal} rechazadas (Aplicada=No)`);
  console.log(`Conciliados: ${matched.length}`);
  console.log(`A revisar: ${results.filter((r) => r.status === "REVIEW").length}`);
  console.log(`Sin conciliar: ${results.filter((r) => r.status === "UNMATCHED").length}`);

  console.log("\n=== Simulación imputación ===");
  console.log(`Período: ${PERIOD}`);
  console.log(sim.message);
  console.log(`Total ARS: ${sim.totalAmount.toLocaleString("es-AR")}`);
  if (sim.notFoundCount > 0) {
    console.log(`\nSin cliente (${sim.notFoundCount}):`);
    console.log(sim.notFound.slice(0, 15).join("\n"));
  }
  if (sim.skippedCount > 0) {
    console.log(`\nOmitidos (${sim.skippedCount}):`);
    console.log(sim.skipped.slice(0, 10).join("\n"));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
