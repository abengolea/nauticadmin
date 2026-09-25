/**
 * Audita CUIT/DNI de clientes (Marinas del Yaguarón por defecto).
 *   npx tsx scripts/audit-player-docs.ts [patron]
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as admin from 'firebase-admin';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const SCHOOL_ID = process.env.SCHOOL_ID?.trim() ?? 'WZAf1Mw08Uq047wneIxI';
const pattern = (process.argv[2] ?? '').trim().toUpperCase();

function initDb(): admin.firestore.Firestore {
  if (admin.apps.length) return admin.firestore();
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ??
    (fs.existsSync('service-account.json') ? 'service-account.json' : '');
  if (!credPath) throw new Error('Falta credencial Firebase');
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(credPath, 'utf8'))),
  });
  return admin.firestore();
}

function digits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

function isPseudoCuit(cuit: string): boolean {
  return /^20\d{8}0$/.test(cuit);
}

async function main() {
  const db = initDb();
  const snap = await db.collection(`schools/${SCHOOL_ID}/players`).get();

  let active = 0;
  let dniOnly = 0;
  let cuitOnly = 0;
  let both = 0;
  let neither = 0;
  const pseudoCuit: Array<{ name: string; cuit: string; dni: string; id: string }> = [];
  let match: Record<string, unknown> | null = null;

  for (const d of snap.docs) {
    const x = d.data();
    if (x.archived) continue;
    active++;

    const name = `${x.lastName ?? ''} ${x.firstName ?? ''}`.trim();
    const dni = digits(x.dni);
    const cuit = digits(x.cuit);

    if (pattern && name.toUpperCase().includes(pattern)) {
      match = {
        id: d.id,
        name,
        dni: x.dni ?? null,
        cuit: x.cuit ?? null,
        condicionIVA: x.condicionIVA ?? null,
        requiereFactura: x.requiereFactura ?? null,
        email: x.email ?? null,
      };
    }

    if (cuit && isPseudoCuit(cuit)) {
      pseudoCuit.push({ id: d.id, name, cuit: String(x.cuit), dni: String(x.dni ?? '') });
    }

    if (cuit && dni) both++;
    else if (cuit) cuitOnly++;
    else if (dni) dniOnly++;
    else neither++;
  }

  console.log('\n=== Resumen clientes activos ===');
  console.log({ totalActivos: active, soloDNI: dniOnly, soloCUIT: cuitOnly, ambos: both, sinDocumento: neither });
  console.log(`Pseudo-CUIT en campo cuit (20-DNI-0): ${pseudoCuit.length}`);

  if (pseudoCuit.length) {
    console.log('\n=== Pseudo-CUIT en campo cuit (muestra) ===');
    for (const p of pseudoCuit.slice(0, 20)) {
      console.log(`- ${p.name} | cuit: ${p.cuit} | dni: ${p.dni || '-'}`);
    }
  }

  if (match) {
    console.log('\n=== Cliente buscado ===');
    console.log(JSON.stringify(match, null, 2));

    const dni = digits(match.dni);
    const cuit = digits(match.cuit);
    console.log('\n=== Diagnóstico AFIP ===');
    if (cuit && isPseudoCuit(cuit)) {
      console.log('PROBLEMA: CUIT parece DNI disfrazado (20-xxxxxxxx-0). Usar campo DNI.');
    } else if (dni && !cuit) {
      console.log('OK en Firestore: tiene DNI, sin CUIT.');
      console.log('BUG app: emit-batch formatea DNI como 20-DNI-0 y lo manda como CUIT (DocTipo 80).');
      console.log(`  DNI real: ${dni} → debería ir DocTipo 96, DocNro ${dni}`);
      console.log(`  Lo que manda hoy: DocTipo 80, DocNro 20${dni}0 (= ${`20${dni}0`})`);
    } else if (cuit) {
      console.log(`Tiene CUIT cargado (${cuit}, ${cuit.length} dígitos).`);
    } else {
      console.log('Sin CUIT ni DNI.');
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
