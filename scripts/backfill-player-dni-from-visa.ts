/**
 * Completa DNI en fichas usando el listado Visa (columna G = a quién imputar).
 *
 * Dry-run: npx tsx scripts/backfill-player-dni-from-visa.ts
 * Aplicar: APPLY=1 npx tsx scripts/backfill-player-dni-from-visa.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import * as XLSX from "xlsx";
import * as admin from "firebase-admin";
import { parseRelationsFromRows } from "../src/lib/reconciliacion-excel/parser";
import type { RelationRow } from "../src/lib/reconciliacion-excel/types";
import { digitsOnly } from "../src/lib/reconciliacion-excel/impute-match";
import { cleanImputeTargetName, imputeTargetNames } from "../src/lib/reconciliacion-excel/impute-match";
import { normalizeString } from "../src/lib/text-normalize";
import { payerNameKeys } from "../src/lib/reconciliacion-excel/player-lookup";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

const SCHOOL_ID = process.env.SCHOOL_ID?.trim() ?? "WZAf1Mw08Uq047wneIxI";
const APPLY = process.env.APPLY === "1";
const LISTADO =
  process.env.LISTADO_CREDITO ?? String.raw`c:\Users\Adrian\Downloads\9 VISA CREDITO SEPTIEMBRE 2026.xlsx`;

type PlayerRow = {
  id: string;
  lastName: string;
  firstName: string;
  dni: string;
  archived: boolean;
  displayName: string;
  nameKeys: Set<string>;
};

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

function buildNameKeys(lastName: string, firstName: string): Set<string> {
  const keys = new Set<string>();
  const full = `${lastName} ${firstName}`.trim();
  for (const k of payerNameKeys(full)) keys.add(k);
  keys.add(normalizeString(full));
  return keys;
}

function findPlayersByTargetName(target: string, players: PlayerRow[]): PlayerRow[] {
  const cleaned = cleanImputeTargetName(target);
  const searchKeys = new Set(payerNameKeys(cleaned));
  searchKeys.add(normalizeString(cleaned));
  return players.filter((p) => {
    if (p.archived || p.dni) return false;
    if (normalizeString(p.displayName).startsWith("ZZ ")) return false;
    for (const k of searchKeys) {
      if (p.nameKeys.has(k)) return true;
    }
    return false;
  });
}

function resolvePlayerForRelation(rel: RelationRow, players: PlayerRow[]): PlayerRow | null {
  const dni = digitsOnly(rel.dni ?? "");
  if (dni.length < 6) return null;

  const existing = players.find((p) => p.dni === dni && !p.archived);
  if (existing) return null;

  for (const name of imputeTargetNames({
    imputeToRaw: rel.imputeToRaw,
    listadoLastName: rel.listadoLastName,
    listadoFirstName: rel.listadoFirstName,
    accountRaw: rel.accountRaw,
    payerRaw: rel.payerRaw,
  })) {
    const hits = findPlayersByTargetName(name, players);
    if (hits.length === 1) return hits[0]!;
  }
  return null;
}

async function main() {
  const { relations } = parseRelationsFromRows(readXlsx(LISTADO), "credit");
  const db = initDb();
  const playersSnap = await db.collection(`schools/${SCHOOL_ID}/players`).get();
  const players: PlayerRow[] = playersSnap.docs.map((d) => {
    const x = d.data() as {
      firstName?: string;
      lastName?: string;
      dni?: string;
      archived?: boolean;
    };
    const lastName = String(x.lastName ?? "").trim();
    const firstName = String(x.firstName ?? "").trim();
    return {
      id: d.id,
      lastName,
      firstName,
      dni: digitsOnly(String(x.dni ?? "")),
      archived: x.archived === true,
      displayName: `${lastName} ${firstName}`.trim(),
      nameKeys: buildNameKeys(lastName, firstName),
    };
  });

  const toApply: Array<{ playerId: string; playerName: string; dni: string; source: string }> = [];
  const skipped: Array<{ source: string; dni: string; reason: string }> = [];
  const usedPlayers = new Set<string>();

  for (const rel of relations) {
    const dni = digitsOnly(rel.dni ?? "");
    if (dni.length < 6) continue;

    const source = rel.imputeToRaw
      ? `G: ${rel.imputeToRaw}`
      : `${rel.listadoLastName} ${rel.listadoFirstName}`.trim();

    const match = resolvePlayerForRelation(rel, players);
    if (!match) {
      skipped.push({ source, dni, reason: "Sin match único en náutica" });
      continue;
    }
    if (usedPlayers.has(match.id)) {
      skipped.push({ source, dni, reason: `Ficha ${match.displayName} ya asignada a otro DNI` });
      continue;
    }

    usedPlayers.add(match.id);
    toApply.push({ playerId: match.id, playerName: match.displayName, dni, source });
  }

  console.log(`\nModo: ${APPLY ? "APLICAR" : "DRY-RUN"}`);
  console.log(`Desde listado Visa (${relations.length} filas)\n`);
  console.log(`DNIs a cargar: ${toApply.length}`);
  console.log(`Sin match seguro: ${skipped.length}\n`);

  for (const row of toApply) {
    console.log(`${row.playerName} ← DNI ${row.dni} (${row.source})`);
  }

  if (APPLY && toApply.length) {
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();
    for (const row of toApply) {
      batch.update(db.collection(`schools/${SCHOOL_ID}/players`).doc(row.playerId), {
        dni: row.dni,
        updatedAt: now,
        dniBackfillSource: "visa_listado_sept_2026",
        dniBackfillAt: now,
      });
    }
    await batch.commit();
    console.log(`\n✓ ${toApply.length} DNIs cargados desde listado.`);
  } else if (toApply.length) {
    console.log("\nPara aplicar: APPLY=1 npx tsx scripts/backfill-player-dni-from-visa.ts");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
