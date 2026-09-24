/**
 * Diagnóstico detallado de pagos conciliados sin cliente para imputar.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import * as XLSX from "xlsx";
import * as admin from "firebase-admin";
import { detectColumnMapping } from "../src/lib/reconciliacion-excel/column-mapping";
import { parseRelationsFromRows, buildPaymentsFromRows } from "../src/lib/reconciliacion-excel/parser";
import { runReconciliation } from "../src/lib/reconciliacion-excel/reconcile";
import { buildPlayerLookup } from "../src/lib/reconciliacion-excel/player-lookup";
import { RENDICION_DA_HEADERS } from "../src/lib/reconciliacion-excel/types";
import type { ImputePaymentItem } from "../src/lib/reconciliacion-excel/types";
import {
  digitsOnly,
  dniFromAccountRaw,
  nameFromAccountRaw,
} from "../src/lib/reconciliacion-excel/impute-match";
import { normalizeString } from "../src/lib/text-normalize";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

const SCHOOL_ID = process.env.SCHOOL_ID?.trim() ?? "WZAf1Mw08Uq047wneIxI";
const LISTADO = process.env.LISTADO_CREDITO ?? String.raw`c:\Users\Adrian\Downloads\9 VISA CREDITO SEPTIEMBRE 2026.xlsx`;
const RENDICION =
  process.env.RENDICION_CREDITO ??
  String.raw`c:\Users\Adrian\Downloads\rendición_DA_visa-crédito resumen sept-cuota oct26.xlsx`;

function readXlsx(filePath: string): string[][] {
  const wb = XLSX.readFile(path.resolve(filePath));
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  return XLSX.utils
    .sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "", raw: false })
    .map((row) => row.map((c) => (c != null ? String(c).trim() : "")));
}

function initDb(): admin.firestore.Firestore {
  if (admin.apps.length) return admin.firestore();
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ??
    (fs.existsSync("service-account.json") ? "service-account.json" : "");
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(credPath, "utf8"))),
  });
  return admin.firestore();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizeString(a).split(" ").filter((t) => t.length > 2));
  const tb = new Set(normalizeString(b).split(" ").filter((t) => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, tb.size);
}

async function main() {
  const listadoRows = readXlsx(LISTADO);
  const { relations } = parseRelationsFromRows(listadoRows, "credit");
  const rendRows = readXlsx(RENDICION);
  const headers = (rendRows[0] ?? []).map((h) => String(h ?? "").trim());
  const mapping = detectColumnMapping(headers.length ? headers : [...RENDICION_DA_HEADERS]);
  const { payments } = buildPaymentsFromRows(headers, rendRows.slice(1), mapping, "credit");

  const results = runReconciliation(relations, payments);
  const matched = results.filter((r) => r.status === "MATCHED");
  const items: ImputePaymentItem[] = matched.map((r) => ({
    paymentRowId: r.paymentRowId,
    payerRaw: r.payerRaw,
    amount: r.amount ?? 0,
    accountKey: r.matchedAccountKey!,
    accountRaw:
      relations.find((rel) => rel.accountKey === r.matchedAccountKey)?.accountRaw ?? r.matchedAccountKey!,
    sourceKind: r.sourceKind,
    aplicada: r.aplicada,
    cardLast4: r.cardLast4,
  }));

  const db = initDb();
  const { findPlayer } = await buildPlayerLookup(db, SCHOOL_ID);
  const playersSnap = await db.collection(`schools/${SCHOOL_ID}/players`).get();

  type PlayerInfo = {
    id: string;
    name: string;
    dni: string;
    usuarioId: string;
    archived: boolean;
  };
  const players: PlayerInfo[] = playersSnap.docs.map((d) => {
    const x = d.data() as {
      firstName?: string;
      lastName?: string;
      dni?: string;
      usuarioId?: string;
      archived?: boolean;
    };
    return {
      id: d.id,
      name: `${x.lastName ?? ""} ${x.firstName ?? ""}`.trim(),
      dni: digitsOnly(String(x.dni ?? "")),
      usuarioId: digitsOnly(String(x.usuarioId ?? "")),
      archived: x.archived === true,
    };
  });

  const notFound = items.filter((item) => !findPlayer(item));

  console.log(`\nTotal sin cliente para imputar: ${notFound.length}\n`);
  console.log(
    "Nº\tPagador Visa\tDNI Excel\tImporte\tMotivo probable\tSugerencia en sistema"
  );
  console.log("-".repeat(120));

  notFound.forEach((item, i) => {
    const dni = dniFromAccountRaw(item.accountRaw) || digitsOnly(item.accountKey);
    const payer = item.payerRaw;
    const amount = item.amount.toLocaleString("es-AR");

    let reason = "";
    let suggestion = "";

    const byExactDni = players.filter(
      (p) => p.dni && dni && (p.dni === dni || p.dni.endsWith(dni) || dni.endsWith(p.dni))
    );
    const byUsuarioId = players.filter((p) => p.usuarioId && dni && p.usuarioId === dni);
    const activeByDni = byExactDni.filter((p) => !p.archived);
    const archivedByDni = byExactDni.filter((p) => p.archived);

    if (archivedByDni.length > 0 && activeByDni.length === 0) {
      reason = "Cliente archivado con ese DNI";
      suggestion = `${archivedByDni[0]!.name} (${archivedByDni[0]!.id})`;
    } else if (byUsuarioId.length > 0 && activeByDni.length === 0) {
      reason = "DNI coincide con usuarioId, no con campo dni";
      suggestion = `${byUsuarioId[0]!.name} — cargar DNI ${dni} en ficha`;
    } else if (dni.length < 6) {
      reason = "Sin DNI usable en el listado";
    } else {
      const nameCandidates = players
        .filter((p) => !p.archived)
        .map((p) => ({ p, score: tokenOverlap(payer, p.name) }))
        .filter((x) => x.score >= 0.34)
        .sort((a, b) => b.score - a.score);

      if (nameCandidates.length > 0) {
        const best = nameCandidates[0]!;
        reason = `Nombre parecido (${Math.round(best.score * 100)}%) pero sin match exacto`;
        suggestion = `${best.p.name}${best.p.dni ? ` DNI ${best.p.dni}` : " sin DNI"}`;
      } else if (/S\.A\.|SA\b|SERVICIO|SEGURIDAD|PORTUAR|EMB/i.test(payer)) {
        reason = "Empresa / razón social — nombre distinto en NauticAdmin";
      } else {
        reason = "No hay cliente con ese DNI ni nombre similar en la náutica";
      }

      if (!reason.includes("archivado") && dni.length >= 6) {
        const anyWithDni = players.some((p) => p.dni === dni);
        if (!anyWithDni) {
          reason = "DNI del Excel no cargado en ninguna ficha";
          if (nameCandidates[0]) {
            suggestion = nameCandidates[0].p.name + (nameCandidates[0].p.dni ? "" : " — falta DNI");
          }
        }
      }
    }

    console.log(
      `${String(i + 1).padStart(2, "0")}\t${payer}\t${dni || "—"}\t$${amount}\t${reason}\t${suggestion}`
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
