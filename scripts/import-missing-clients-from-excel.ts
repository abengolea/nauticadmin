/**
 * Crea en NauticAdmin los clientes vigentes del Excel que todavía no tienen ficha.
 *
 * Dry-run: npx tsx scripts/import-missing-clients-from-excel.ts
 * Aplicar: APPLY=1 npx tsx scripts/import-missing-clients-from-excel.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import * as XLSX from "xlsx";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  formatCuitDisplay,
  isPseudoCuitFromDni,
  normalizeDigits,
  validateCuitChecksum,
} from "../src/lib/fiscal/cuit";
import { normalizeString } from "../src/lib/text-normalize";
import { fuzzyNameScore, pickFuzzyMatch } from "../src/lib/reconciliacion-excel/name-fuzzy";
import { CONDICION_IVA_RECEPTOR } from "../src/lib/fiscal/constants";
import { getCondicionIvaLabel } from "../src/lib/fiscal/iva-receptor";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

const SCHOOL_ID = process.env.SCHOOL_ID?.trim() ?? "WZAf1Mw08Uq047wneIxI";
const APPLY = process.env.APPLY === "1";
const LISTADO =
  process.env.LISTADO_CLIENTES ??
  String.raw`c:\Users\Adrian\Downloads\listrado clientes marinas Adri.xlsx`;

type ExcelRow = {
  excelName: string;
  cleanedName: string;
  iva: string;
  docType: string;
  docRaw: string;
  digits: string;
  vigente: string;
  email: string;
  phone: string;
  ubicacion: string;
  embarcacion: string;
  matricula: string;
  datos: string;
  clienteDesde: string;
  isZz: boolean;
};

type PlayerRow = {
  id: string;
  displayName: string;
  dni: string;
  cuit: string;
  email: string;
  nameKeys: Set<string>;
};

function initDb(): admin.firestore.Firestore {
  if (admin.apps.length) return admin.firestore();
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ??
    (fs.existsSync("service-account.json") ? "service-account.json" : "");
  if (!credPath) throw new Error("Falta credencial Firebase");
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
  if (parts.length >= 2) add(`${parts.slice(1).join(" ")} ${parts[0]}`);
  return [...keys];
}

function splitApellidoNombres(full: string): { firstName: string; lastName: string } {
  const cleaned = cleanExcelName(full);
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Sin nombre", lastName: "Importado" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "Importado" };
  return { lastName: parts[0]!, firstName: parts.slice(1).join(" ") };
}

function classifyDoc(digits: string): "cuit" | "dni" | "invalid" | "empty" {
  if (!digits || digits === "111111111" || /^0+$/.test(digits)) return "empty";
  if (digits.length === 11 && validateCuitChecksum(digits) && !isPseudoCuitFromDni(digits)) {
    return "cuit";
  }
  if (digits.length === 7 || digits.length === 8) return "dni";
  return "invalid";
}

function mapIva(raw: string): { id: number; label: string } {
  const s = normalizeString(raw);
  if (/RESP\s*INSCRIPTO|RESPONSABLE\s*INSCRIPTO/.test(s)) {
    return {
      id: CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO,
      label: getCondicionIvaLabel(CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO),
    };
  }
  if (/MONOTRIBUTO/.test(s)) {
    return {
      id: CONDICION_IVA_RECEPTOR.RESPONSABLE_MONOTRIBUTO,
      label: getCondicionIvaLabel(CONDICION_IVA_RECEPTOR.RESPONSABLE_MONOTRIBUTO),
    };
  }
  if (/EXENTO/.test(s)) {
    return {
      id: CONDICION_IVA_RECEPTOR.IVA_SUJETO_EXENTO,
      label: getCondicionIvaLabel(CONDICION_IVA_RECEPTOR.IVA_SUJETO_EXENTO),
    };
  }
  if (/NO\s*RESPONSABLE|NO\s*ALCANZADO/.test(s)) {
    return {
      id: CONDICION_IVA_RECEPTOR.IVA_NO_ALCANZADO,
      label: getCondicionIvaLabel(CONDICION_IVA_RECEPTOR.IVA_NO_ALCANZADO),
    };
  }
  return {
    id: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
    label: getCondicionIvaLabel(CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL),
  };
}

function isVigente(raw: string): boolean {
  const s = normalizeString(raw);
  return s === "SI" || s === "S" || s === "YES" || s === "VIGENTE" || s === "ACTUAL";
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
    if (/^CONSUMIDOR\s+FINAL$/i.test(excelName)) continue;
    out.push({
      excelName,
      cleanedName: cleanExcelName(excelName),
      iva: String(row[9] ?? "").trim(),
      docType: String(row[10] ?? "").trim(),
      docRaw: String(row[11] ?? "").trim(),
      digits: normalizeDigits(String(row[11] ?? "")),
      vigente: String(row[12] ?? "").trim(),
      email: String(row[7] ?? "").trim().toLowerCase(),
      phone: String(row[6] ?? "").trim(),
      ubicacion: String(row[5] ?? "").trim(),
      embarcacion: String(row[13] ?? "").trim(),
      matricula: String(row[16] ?? "").trim(),
      datos: String(row[17] ?? "").trim(),
      clienteDesde: String(row[14] ?? "").trim(),
      isZz: /^\s*ZZ\b/i.test(excelName),
    });
  }
  return out;
}

function findMatch(excel: ExcelRow, players: PlayerRow[]): PlayerRow | undefined {
  if (excel.digits.length >= 7) {
    const byDoc = players.filter(
      (p) => p.cuit === excel.digits || p.dni === excel.digits
    );
    if (byDoc.length === 1) return byDoc[0];
  }
  const keys = new Set(nameKeysFor(excel.excelName));
  const exact = players.filter((p) => {
    for (const k of keys) if (p.nameKeys.has(k)) return true;
    return false;
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact[0];

  if (excel.email.includes("@")) {
    const byEmail = players.filter((p) => p.email === excel.email);
    if (byEmail.length === 1) return byEmail[0];
  }

  return pickFuzzyMatch(
    excel.cleanedName,
    players,
    (target, p) => fuzzyNameScore(target, p.displayName),
    { minScore: 0.9, minGap: 0.12 }
  );
}

async function main() {
  const excelRows = readExcelRows(LISTADO);
  const db = initDb();
  const snap = await db.collection(`schools/${SCHOOL_ID}/players`).get();
  const players: PlayerRow[] = snap.docs.map((d) => {
    const x = d.data() as {
      firstName?: string;
      lastName?: string;
      dni?: string;
      cuit?: string;
      email?: string;
      tutorContact?: { name?: string };
    };
    const displayName = `${x.lastName ?? ""} ${x.firstName ?? ""}`.trim();
    return {
      id: d.id,
      displayName,
      dni: normalizeDigits(x.dni),
      cuit: normalizeDigits(x.cuit),
      email: String(x.email ?? "").trim().toLowerCase(),
      nameKeys: new Set([
        ...nameKeysFor(displayName),
        ...nameKeysFor(`${x.firstName ?? ""} ${x.lastName ?? ""}`),
        ...nameKeysFor(String(x.tutorContact?.name ?? "")),
      ]),
    };
  });

  const vigente = excelRows.filter((r) => isVigente(r.vigente));
  const missing = vigente.filter((r) => !r.isZz && !findMatch(r, players));
  const missingZz = vigente.filter((r) => r.isZz && !findMatch(r, players));

  console.log(`\nModo: ${APPLY ? "APLICAR" : "SIMULACIÓN"}`);
  console.log(`Excel vigentes: ${vigente.length}  |  Fichas: ${players.length}`);
  console.log(`Faltan (sin ZZ, actuales): ${missing.length}`);
  console.log(`Faltan con prefijo ZZ (no se cargan): ${missingZz.length}\n`);

  for (const r of missing) {
    const kind = classifyDoc(r.digits);
    const doc =
      kind === "cuit"
        ? `CUIT ${formatCuitDisplay(r.digits)}`
        : kind === "dni"
          ? `DNI ${r.digits}`
          : r.docRaw || "-";
    console.log(
      `  ${r.excelName}  |  ${r.iva}  |  ${doc}  |  ${r.embarcacion || "-"}  |  ${r.ubicacion || "-"}`
    );
  }

  if (!APPLY) {
    console.log("\nNada se escribió. Para cargarlos:");
    console.log("  APPLY=1 npx tsx scripts/import-missing-clients-from-excel.ts");
    return;
  }

  let created = 0;
  for (const r of missing) {
    const { firstName, lastName } = splitApellidoNombres(r.excelName);
    const iva = mapIva(r.iva);
    const kind = classifyDoc(r.digits);
    const email = r.email.includes("@") ? r.email : undefined;
    const embarcaciones =
      r.embarcacion || r.matricula || r.datos
        ? [
            {
              id: "legacy-0",
              nombre: r.embarcacion || undefined,
              matricula: r.matricula || undefined,
              datos: r.datos || undefined,
            },
          ]
        : undefined;

    const playerData: Record<string, unknown> = {
      firstName,
      lastName,
      tutorContact: {
        name: r.cleanedName || r.excelName,
        phone: r.phone || "",
      },
      status: "active",
      createdAt: Timestamp.now(),
      createdBy: "import-missing-excel-2026-10",
      condicionIVAId: iva.id,
      condicionIVA: iva.label,
      requiereFactura: true,
      ...(email && { email }),
      ...(kind === "cuit" && { cuit: formatCuitDisplay(r.digits) }),
      ...(kind === "dni" && { dni: r.digits }),
      ...(r.ubicacion && { ubicacion: r.ubicacion }),
      ...(r.clienteDesde && { clienteDesde: r.clienteDesde }),
      ...(r.datos && { observations: r.datos }),
      ...(r.embarcacion && { embarcacionNombre: r.embarcacion }),
      ...(r.matricula && { embarcacionMatricula: r.matricula }),
      ...(r.datos && { embarcacionDatos: r.datos }),
      ...(embarcaciones && { embarcaciones }),
    };

    const ref = db.collection(`schools/${SCHOOL_ID}/players`).doc();
    await ref.set(playerData);
    if (email) {
      await db.doc(`playerLogins/${email}`).set({
        schoolId: SCHOOL_ID,
        playerId: ref.id,
      });
    }
    created++;
  }

  console.log(`\n✓ Se crearon ${created} clientes nuevos.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
