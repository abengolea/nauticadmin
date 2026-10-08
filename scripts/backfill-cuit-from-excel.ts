/**
 * Copia CUITs válidos del listado Excel (columna Cuit//Documento, a veces
 * etiquetada como DNI) al campo `cuit` del cliente en NauticAdmin.
 *
 * Dry-run (default): npx tsx scripts/backfill-cuit-from-excel.ts
 * Aplicar:           APPLY=1 npx tsx scripts/backfill-cuit-from-excel.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import * as XLSX from "xlsx";
import * as admin from "firebase-admin";
import {
  formatCuitDisplay,
  isPseudoCuitFromDni,
  normalizeDigits,
  validateCuitChecksum,
} from "../src/lib/fiscal/cuit";
import { normalizeString } from "../src/lib/text-normalize";
import { fuzzyNameScore, pickFuzzyMatch } from "../src/lib/reconciliacion-excel/name-fuzzy";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

const SCHOOL_ID = process.env.SCHOOL_ID?.trim() ?? "WZAf1Mw08Uq047wneIxI";
const APPLY = process.env.APPLY === "1";
const LISTADO =
  process.env.LISTADO_CLIENTES ??
  String.raw`c:\Users\Adrian\Downloads\listrado clientes marinas Adri.xlsx`;

type PlayerRow = {
  id: string;
  displayName: string;
  dni: string;
  cuit: string;
  iva: string;
  archived: boolean;
  status: string;
  nameKeys: Set<string>;
};

type ExcelRow = {
  excelName: string;
  cleanedName: string;
  iva: string;
  docType: string;
  docRaw: string;
  digits: string;
  vigente: string;
};

type SimRow = {
  action:
    | "would_set"
    | "already_same"
    | "conflict"
    | "ambiguous"
    | "unmatched"
    | "skip_invalid"
    | "skip_not_cuit";
  excelName: string;
  excelIva: string;
  excelDoc: string;
  playerId?: string;
  playerName?: string;
  playerDni?: string;
  playerCuit?: string;
  playerArchived?: boolean;
  matchKind?: string;
  reason?: string;
};

function initDb(): admin.firestore.Firestore {
  if (admin.apps.length) return admin.firestore();
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ??
    (fs.existsSync("service-account.json") ? "service-account.json" : "");
  if (!credPath) throw new Error("Falta credencial Firebase (service-account.json)");
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(credPath, "utf8"))),
  });
  return admin.firestore();
}

function cleanExcelName(raw: string): string {
  return String(raw ?? "")
    .replace(/\*+/g, " ")
    .replace(/^\s*(ZZ|ARR)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameKeysFor(raw: string): string[] {
  const keys = new Set<string>();
  const add = (s: string) => {
    const n = normalizeString(s);
    if (n) keys.add(n);
  };
  add(raw);
  add(cleanExcelName(raw));
  const cleaned = cleanExcelName(raw);
  const parts = normalizeString(cleaned).split(" ").filter(Boolean);
  if (parts.length >= 2) {
    add(`${parts.slice(1).join(" ")} ${parts[0]}`);
  }
  return [...keys];
}

function classifyDoc(digits: string): "cuit" | "dni" | "invalid" | "empty" {
  if (!digits || digits === "111111111" || /^0+$/.test(digits)) return "empty";
  if (digits.length === 11 && validateCuitChecksum(digits) && !isPseudoCuitFromDni(digits)) {
    return "cuit";
  }
  if (digits.length === 7 || digits.length === 8) return "dni";
  return "invalid";
}

function isRi(iva: string): boolean {
  return /resp\s*inscripto|responsable\s*inscripto/i.test(iva);
}

function readExcelRows(filePath: string): ExcelRow[] {
  const wb = XLSX.readFile(path.resolve(filePath));
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const out: ExcelRow[] = [];
  for (let i = 9; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const excelName = String(row[0] ?? "").trim();
    if (!excelName) continue;
    const docRaw = String(row[11] ?? "").trim();
    out.push({
      excelName,
      cleanedName: cleanExcelName(excelName),
      iva: String(row[9] ?? "").trim(),
      docType: String(row[10] ?? "").trim(),
      docRaw,
      digits: normalizeDigits(docRaw),
      vigente: String(row[12] ?? "").trim(),
    });
  }
  return out;
}

function buildPlayer(d: admin.firestore.QueryDocumentSnapshot): PlayerRow {
  const x = d.data() as {
    firstName?: string;
    lastName?: string;
    dni?: string;
    cuit?: string;
    condicionIVA?: string;
    archived?: boolean;
    status?: string;
    tutorContact?: { name?: string };
  };
  const lastName = String(x.lastName ?? "").trim();
  const firstName = String(x.firstName ?? "").trim();
  const displayName = `${lastName} ${firstName}`.trim();
  const keys = new Set<string>([
    ...nameKeysFor(displayName),
    ...nameKeysFor(`${firstName} ${lastName}`),
    ...nameKeysFor(String(x.tutorContact?.name ?? "")),
  ]);
  return {
    id: d.id,
    displayName,
    dni: normalizeDigits(x.dni),
    cuit: normalizeDigits(x.cuit),
    iva: String(x.condicionIVA ?? ""),
    archived: x.archived === true,
    status: String(x.status ?? ""),
    nameKeys: keys,
  };
}

function playerNameUsable(p: PlayerRow): boolean {
  const n = normalizeString(p.displayName);
  const parts = n.split(" ").filter((t) => t.length > 1);
  return n.length >= 6 && parts.length >= 2;
}

function findExactName(excelName: string, players: PlayerRow[]): PlayerRow[] {
  const keys = nameKeysFor(excelName);
  const exact: PlayerRow[] = [];
  for (const p of players) {
    for (const k of keys) {
      if (p.nameKeys.has(k)) {
        exact.push(p);
        break;
      }
    }
  }
  return [...new Map(exact.map((p) => [p.id, p])).values()];
}

function findByDoc(digits: string, players: PlayerRow[]): PlayerRow[] {
  const hits = players.filter((p) => {
    if (p.cuit === digits || p.dni === digits) return true;
    if (digits.length === 11 && p.dni.length === 8 && digits.slice(2, 10) === p.dni) return true;
    return false;
  });
  return [...new Map(hits.map((p) => [p.id, p])).values()];
}

function findFuzzy(excelName: string, players: PlayerRow[], claimed: Set<string>): PlayerRow | undefined {
  const candidates = players.filter((p) => !p.archived && !claimed.has(p.id) && playerNameUsable(p));
  return pickFuzzyMatch(
    cleanExcelName(excelName),
    candidates,
    (target, p) => fuzzyNameScore(target, p.displayName),
    { minScore: 0.88, minGap: 0.15 }
  );
}

function resolveTargets(
  excel: ExcelRow,
  players: PlayerRow[],
  claimed: Map<string, string>,
  allowFuzzy: boolean
): { targets: PlayerRow[]; kind: string } {
  const byDoc = excel.digits.length >= 8 ? findByDoc(excel.digits, players) : [];
  if (byDoc.length === 1) return { targets: byDoc, kind: "document" };
  if (byDoc.length > 1) {
    const active = byDoc.filter((p) => !p.archived);
    if (active.length >= 1) return { targets: active, kind: "document_multi" };
  }

  const exact = findExactName(excel.excelName, players);
  if (exact.length >= 1) return { targets: exact, kind: exact.length === 1 ? "exact" : "exact_multi" };

  if (allowFuzzy) {
    const fuzzy = findFuzzy(excel.excelName, players, new Set(claimed.keys()));
    if (fuzzy) return { targets: [fuzzy], kind: "fuzzy" };
  }
  return { targets: [], kind: "none" };
}

function printGroup(title: string, rows: SimRow[], limit = 40) {
  console.log(`\n--- ${title} (${rows.length}) ---`);
  for (const r of rows.slice(0, limit)) {
    const who = r.playerName ? `${r.playerName}${r.playerArchived ? " [archivado]" : ""}` : "—";
    console.log(
      `  ${r.excelName}  |  ${r.excelIva || "-"}  |  Excel ${r.excelDoc}  →  ${who}` +
        (r.playerCuit ? `  (cuit actual ${formatCuitDisplay(r.playerCuit)})` : "") +
        (r.reason ? `  [${r.reason}]` : "") +
        (r.matchKind ? `  {${r.matchKind}}` : "")
    );
  }
  if (rows.length > limit) console.log(`  … y ${rows.length - limit} más`);
}

async function main() {
  const excelRows = readExcelRows(LISTADO);
  const db = initDb();
  const snap = await db.collection(`schools/${SCHOOL_ID}/players`).get();
  const players = snap.docs.map(buildPlayer);

  const results: SimRow[] = [];
  const claimed = new Map<string, string>();
  const pendingFuzzy: ExcelRow[] = [];

  const considerPlayer = (
    excel: ExcelRow,
    player: PlayerRow,
    matchKind: string
  ) => {
    const formatted = formatCuitDisplay(excel.digits);
    if (player.cuit && player.cuit === excel.digits) {
      results.push({
        action: "already_same",
        excelName: excel.excelName,
        excelIva: excel.iva,
        excelDoc: excel.docRaw,
        playerId: player.id,
        playerName: player.displayName,
        playerDni: player.dni,
        playerCuit: player.cuit,
        playerArchived: player.archived,
        matchKind,
      });
      return;
    }
    if (player.cuit && player.cuit !== excel.digits) {
      results.push({
        action: "conflict",
        excelName: excel.excelName,
        excelIva: excel.iva,
        excelDoc: excel.docRaw,
        playerId: player.id,
        playerName: player.displayName,
        playerDni: player.dni,
        playerCuit: player.cuit,
        playerArchived: player.archived,
        matchKind,
        reason: `Ficha tiene ${formatCuitDisplay(player.cuit)}, Excel trae ${formatted}`,
      });
      return;
    }
    const prev = claimed.get(player.id);
    if (prev && prev !== excel.digits) {
      results.push({
        action: "conflict",
        excelName: excel.excelName,
        excelIva: excel.iva,
        excelDoc: excel.docRaw,
        playerId: player.id,
        playerName: player.displayName,
        playerDni: player.dni,
        playerCuit: player.cuit,
        playerArchived: player.archived,
        matchKind,
        reason: `Misma ficha ya iba a recibir ${formatCuitDisplay(prev)}`,
      });
      return;
    }
    claimed.set(player.id, excel.digits);
    results.push({
      action: "would_set",
      excelName: excel.excelName,
      excelIva: excel.iva,
      excelDoc: formatted,
      playerId: player.id,
      playerName: player.displayName,
      playerDni: player.dni,
      playerCuit: player.cuit,
      playerArchived: player.archived,
      matchKind,
      reason: player.dni === excel.digits ? "CUIT estaba en campo dni" : undefined,
    });
  };

  for (const excel of excelRows) {
    const kind = classifyDoc(excel.digits);
    if (kind === "empty") continue;
    if (kind !== "cuit") {
      results.push({
        action: kind === "dni" ? "skip_not_cuit" : "skip_invalid",
        excelName: excel.excelName,
        excelIva: excel.iva,
        excelDoc: excel.docRaw,
        reason: kind === "dni" ? `DNI ${excel.digits.length} dígitos, no se copia` : "CUIT inválido / no reconocible",
      });
      continue;
    }

    const { targets, kind: matchKind } = resolveTargets(excel, players, claimed, false);
    if (targets.length === 0) {
      pendingFuzzy.push(excel);
      continue;
    }
    for (const player of targets) considerPlayer(excel, player, matchKind);
  }

  for (const excel of pendingFuzzy) {
    const { targets, kind: matchKind } = resolveTargets(excel, players, claimed, true);
    if (targets.length === 0) {
      results.push({
        action: "unmatched",
        excelName: excel.excelName,
        excelIva: excel.iva,
        excelDoc: excel.docRaw,
        matchKind,
        reason: "Sin match en náutica",
      });
      continue;
    }
    for (const player of targets) considerPlayer(excel, player, matchKind);
  }

  // CUITs que ya están en el DNI de la ficha y no salieron del Excel
  const fromExcelIds = new Set(results.filter((r) => r.playerId).map((r) => r.playerId));
  const extraFromDni: SimRow[] = [];
  for (const p of players) {
    if (fromExcelIds.has(p.id)) continue;
    if (p.archived) continue;
    if (p.cuit) continue;
    if (classifyDoc(p.dni) !== "cuit") continue;
    extraFromDni.push({
      action: "would_set",
      excelName: "(ficha náutica)",
      excelIva: p.iva,
      excelDoc: formatCuitDisplay(p.dni),
      playerId: p.id,
      playerName: p.displayName,
      playerDni: p.dni,
      playerCuit: p.cuit,
      playerArchived: p.archived,
      matchKind: "player_dni",
      reason: "CUIT estaba en campo dni de la ficha",
    });
  }
  results.push(...extraFromDni);

  const wouldSet = results.filter((r) => r.action === "would_set");
  const wouldSetRi = wouldSet.filter((r) => isRi(r.excelIva) || isRi(r.playerCuit ?? ""));
  const wouldSetActive = wouldSet.filter((r) => !r.playerArchived);
  const already = results.filter((r) => r.action === "already_same");
  const conflicts = results.filter((r) => r.action === "conflict");
  const unmatched = results.filter((r) => r.action === "unmatched");
  const unmatchedRi = unmatched.filter((r) => isRi(r.excelIva));
  const ambiguous = results.filter((r) => r.action === "ambiguous");
  const skipInvalid = results.filter((r) => r.action === "skip_invalid");
  const skipDni = results.filter((r) => r.action === "skip_not_cuit");

  console.log(`\nModo: ${APPLY ? "APLICAR" : "SIMULACIÓN (no se escribe nada)"}`);
  console.log(`Excel: ${LISTADO}`);
  console.log(`Náutica: ${SCHOOL_ID}`);
  console.log(`Filas Excel: ${excelRows.length}  |  Fichas: ${players.length}`);
  console.log(`\nResumen:`);
  const uniquePlayers = new Set(wouldSet.map((r) => r.playerId)).size;
  console.log(`  CUITs a copiar al campo cuit:     ${wouldSet.length} filas → ${uniquePlayers} fichas  (activas ${wouldSetActive.length})`);
  console.log(`    de los cuales Resp. Inscripto:  ${wouldSetRi.length}`);
  console.log(`    CUITs que ya estaban en dni:    ${wouldSet.filter((r) => r.reason).length}`);
  console.log(`  Ya tenían el mismo CUIT:          ${already.length}`);
  console.log(`  Conflictos (CUIT distinto):       ${conflicts.length}`);
  console.log(`  Sin match:                        ${unmatched.length}  (RI ${unmatchedRi.length})`);
  console.log(`  Nombre ambiguo:                   ${ambiguous.length}`);
  console.log(`  Documento Excel es DNI (no copia):${skipDni.length}`);
  console.log(`  Documento Excel inválido:         ${skipInvalid.length}`);
  const kindCount = new Map<string, number>();
  for (const r of wouldSet) {
    kindCount.set(r.matchKind ?? "?", (kindCount.get(r.matchKind ?? "?") ?? 0) + 1);
  }
  console.log("  Match kinds a copiar:", Object.fromEntries(kindCount));

  printGroup(
    "Matches FUZZY que se copiarían (revisar)",
    wouldSet.filter((r) => r.matchKind === "fuzzy"),
    80
  );
  printGroup("CUITs que se copiarían (Resp. Inscripto primero)", [
    ...wouldSet.filter((r) => isRi(r.excelIva)),
    ...wouldSet.filter((r) => !isRi(r.excelIva)),
  ], 25);
  printGroup("Conflictos — no se tocan", conflicts, 30);
  printGroup("Resp. Inscripto sin match", unmatchedRi, 40);
  printGroup("Sin match (muestra)", unmatched.filter((r) => !isRi(r.excelIva)), 15);
  printGroup("Ambiguos", ambiguous, 20);
  printGroup("CUIT inválido en Excel (no se copia)", skipInvalid, 20);

  if (APPLY) {
    const toWrite = wouldSet.filter((r) => r.playerId);
    const BATCH = 400;
    for (let i = 0; i < toWrite.length; i += BATCH) {
      const batch = db.batch();
      const now = admin.firestore.FieldValue.serverTimestamp();
      for (const row of toWrite.slice(i, i + BATCH)) {
        batch.update(db.collection(`schools/${SCHOOL_ID}/players`).doc(row.playerId!), {
          cuit: row.excelDoc,
          updatedAt: now,
          cuitBackfillSource: "listado_clientes_excel_2026_10",
          cuitBackfillAt: now,
        });
      }
      await batch.commit();
    }
    console.log(`\n✓ Se copió el CUIT en ${toWrite.length} fichas.`);
  } else {
    console.log("\nNada se escribió. Si el resultado está bien:");
    console.log("  APPLY=1 npx tsx scripts/backfill-cuit-from-excel.ts");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
