/**
 * Pasa a inactive todos los clientes cuyo nombre empieza con ZZ
 * (ex-socios identificados con ese prefijo). No archiva: la ficha queda
 * y se puede listar/activar de nuevo.
 *
 * Dry-run: npx tsx scripts/deactivate-zz-clients.ts
 * Aplicar: APPLY=1 npx tsx scripts/deactivate-zz-clients.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import * as admin from "firebase-admin";
import { normalizeString } from "../src/lib/text-normalize";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

const SCHOOL_ID = process.env.SCHOOL_ID?.trim() ?? "WZAf1Mw08Uq047wneIxI";
const APPLY = process.env.APPLY === "1";
const BATCH_SIZE = 400;

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

/** Prefijo operativo ZZ: primer token del apellido, del nombre o del nombre completo. */
export function isZzClientName(lastName?: string, firstName?: string): boolean {
  const last = normalizeString(lastName ?? "");
  const first = normalizeString(firstName ?? "");
  const full = [last, first].filter(Boolean).join(" ");
  const firstToken = (s: string) => s.split(" ")[0] ?? "";
  return firstToken(last) === "ZZ" || firstToken(first) === "ZZ" || firstToken(full) === "ZZ";
}

async function main() {
  const db = initDb();
  const snap = await db.collection(`schools/${SCHOOL_ID}/players`).get();

  const zz: {
    id: string;
    name: string;
    status: string;
    archived: boolean;
  }[] = [];

  for (const d of snap.docs) {
    const x = d.data() as {
      lastName?: string;
      firstName?: string;
      status?: string;
      archived?: boolean;
    };
    if (!isZzClientName(x.lastName, x.firstName)) continue;
    zz.push({
      id: d.id,
      name: `${x.lastName ?? ""} ${x.firstName ?? ""}`.trim(),
      status: x.status ?? "active",
      archived: x.archived === true,
    });
  }

  const toUpdate = zz.filter((p) => !p.archived && p.status !== "inactive");
  const alreadyInactive = zz.filter((p) => !p.archived && p.status === "inactive");
  const archivedZz = zz.filter((p) => p.archived);

  console.log(`Náutica ${SCHOOL_ID}`);
  console.log(`Total clientes: ${snap.size}`);
  console.log(`Con prefijo ZZ: ${zz.length}`);
  console.log(`  ya inactivos: ${alreadyInactive.length}`);
  console.log(`  archivados (no se tocan): ${archivedZz.length}`);
  console.log(`  a desactivar: ${toUpdate.length}`);
  console.log("");
  for (const p of toUpdate.slice(0, 25)) {
    console.log(`  [${p.status}] ${p.name} (${p.id})`);
  }
  if (toUpdate.length > 25) console.log(`  … y ${toUpdate.length - 25} más`);

  if (!APPLY) {
    console.log("\nDry-run. Para aplicar: APPLY=1 npx tsx scripts/deactivate-zz-clients.ts");
    return;
  }

  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const p of chunk) {
      batch.update(db.doc(`schools/${SCHOOL_ID}/players/${p.id}`), {
        status: "inactive",
      });
    }
    await batch.commit();
    updated += chunk.length;
    console.log(`Actualizados ${updated}/${toUpdate.length}`);
  }

  console.log(`\nListo: ${updated} clientes ZZ pasados a inactive.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
