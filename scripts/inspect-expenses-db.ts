/**
 * Inspección read-only de gastos / proveedores / cuentas corrientes en Firestore.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/inspect-expenses-db.ts
 *   npx tsx scripts/inspect-expenses-db.ts --school=<schoolId>
 *   npx tsx scripts/inspect-expenses-db.ts --school=<schoolId> --q=cestari
 *   npx tsx scripts/inspect-expenses-db.ts --school=<schoolId> --vendor=20172631828
 *   npx tsx scripts/inspect-expenses-db.ts --list-schools
 *
 * Requiere service-account.json o GOOGLE_APPLICATION_CREDENTIALS.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const projectId =
  process.env.GCLOUD_PROJECT ??
  process.env.FIREBASE_PROJECT_ID ??
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

function resolveCredentialsPath(): string {
  const cwd = process.cwd();
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    const absolute = path.isAbsolute(envPath) ? envPath : path.join(cwd, envPath);
    if (fs.existsSync(absolute)) return absolute;
  }
  for (const p of [
    path.join(cwd, 'service-account.json'),
    path.join(cwd, 'service-account.json.json'),
    'C:/SECRETS/nauticadmin-firebase-adminsdk-fbsvc-d511f4fa32.json',
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matchesQuery(haystack: unknown, q: string): boolean {
  if (!q) return true;
  return norm(haystack).includes(norm(q));
}

function shortDate(v: unknown): string {
  if (!v) return '-';
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function money(v: unknown): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (Number.isNaN(n)) return '-';
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function listSchools(db: Firestore) {
  const snap = await db.collection('schools').get();
  console.log(`\n=== Escuelas / náuticas (${snap.size}) ===\n`);
  for (const doc of snap.docs) {
    const d = doc.data();
    const fact = d.facturacion as { razonSocial?: string; cuit?: string } | undefined;
    console.log(
      `${doc.id}\n  name: ${d.name ?? '-'}\n  facturacion: ${fact?.razonSocial ?? '-'} | CUIT ${fact?.cuit ?? '-'}`
    );
  }
}

async function inspectSchool(
  db: Firestore,
  schoolId: string,
  opts: { q?: string; vendorId?: string; limit: number }
) {
  const schoolSnap = await db.collection('schools').doc(schoolId).get();
  if (!schoolSnap.exists) {
    console.error(`Escuela no encontrada: ${schoolId}`);
    process.exit(1);
  }
  const school = schoolSnap.data()!;
  const fact = school.facturacion as { razonSocial?: string; cuit?: string } | undefined;
  console.log(`\n=== Escuela ${schoolId} ===`);
  console.log(`name: ${school.name ?? '-'}`);
  console.log(`facturacion: ${fact?.razonSocial ?? '-'} | CUIT ${fact?.cuit ?? '-'}`);

  // --- Catálogo de proveedores ---
  const vendorsSnap = await db
    .collection('schools')
    .doc(schoolId)
    .collection('expenseVendors')
    .get();

  let vendors = vendorsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (opts.q) {
    vendors = vendors.filter(
      (v) =>
        matchesQuery(v.id, opts.q!) ||
        matchesQuery((v as { name?: string }).name, opts.q!) ||
        matchesQuery((v as { cuit?: string }).cuit, opts.q!)
    );
  }
  if (opts.vendorId) {
    vendors = vendors.filter(
      (v) =>
        v.id === opts.vendorId ||
        String((v as { cuit?: string }).cuit ?? '').replace(/\D/g, '') ===
          opts.vendorId!.replace(/\D/g, '')
    );
  }

  console.log(`\n--- expenseVendors (${vendors.length}${opts.q || opts.vendorId ? ' filtrados' : ''} / ${vendorsSnap.size} total) ---`);
  for (const v of vendors.slice(0, opts.limit)) {
    const vv = v as {
      id: string;
      name?: string;
      cuit?: string;
      ivaCondition?: string;
      cuentaCorrienteHabilitada?: boolean;
    };
    console.log(
      `  [${vv.id}] ${vv.name ?? '-'} | CUIT ${vv.cuit ?? '-'} | IVA ${vv.ivaCondition ?? '-'} | CC ${vv.cuentaCorrienteHabilitada ? 'sí' : 'no'}`
    );
  }
  if (vendors.length > opts.limit) {
    console.log(`  ... +${vendors.length - opts.limit} más (subí --limit=N)`);
  }

  // --- Gastos ---
  const expensesSnap = await db
    .collection('schools')
    .doc(schoolId)
    .collection('expenses')
    .orderBy('createdAt', 'desc')
    .limit(Math.max(opts.limit * 3, 100))
    .get();

  type ExpRow = {
    id: string;
    status?: string;
    createdAt?: string;
    archivedAt?: string;
    supplier?: {
      name?: string;
      cuit?: string;
      vendorId?: string;
    };
    invoice?: { pos?: string; number?: string; issueDate?: string; type?: string };
    amounts?: { total?: number; currency?: string };
    notes?: string;
  };

  let expenses = expensesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExpRow, 'id'>) }));
  if (opts.q) {
    expenses = expenses.filter(
      (e) =>
        matchesQuery(e.id, opts.q!) ||
        matchesQuery(e.supplier?.name, opts.q!) ||
        matchesQuery(e.supplier?.cuit, opts.q!) ||
        matchesQuery(e.supplier?.vendorId, opts.q!) ||
        matchesQuery(e.invoice?.number, opts.q!) ||
        matchesQuery(e.notes, opts.q!)
    );
  }
  if (opts.vendorId) {
    const vid = opts.vendorId.replace(/\D/g, '');
    expenses = expenses.filter((e) => {
      const cuit = (e.supplier?.cuit ?? '').replace(/\D/g, '');
      return (
        e.supplier?.vendorId === opts.vendorId ||
        cuit === vid ||
        e.supplier?.vendorId === vid
      );
    });
  }

  console.log(
    `\n--- expenses (${expenses.length}${opts.q || opts.vendorId ? ' filtrados' : ''} / últimos ${expensesSnap.size} leídos) ---`
  );
  for (const e of expenses.slice(0, opts.limit)) {
    const inferredVendorId =
      e.supplier?.vendorId ||
      (e.supplier?.cuit ? e.supplier.cuit.replace(/\D/g, '').slice(0, 20) : `temp-${e.id}`);
    console.log(
      [
        `  [${e.id}]`,
        `status=${e.status ?? '-'}`,
        e.archivedAt ? 'ARCHIVADA' : '',
        `prov="${e.supplier?.name ?? '-'}"`,
        `cuit=${e.supplier?.cuit ?? '-'}`,
        `vendorId=${e.supplier?.vendorId ?? '(sin)'}`,
        `→ cuenta=${inferredVendorId}`,
        `fc=${e.invoice?.type ?? ''}${e.invoice?.pos ?? ''}-${e.invoice?.number ?? '?'}`,
        `fecha=${shortDate(e.invoice?.issueDate)}`,
        `total=${e.amounts?.currency ?? 'ARS'} ${money(e.amounts?.total)}`,
        `creada=${shortDate(e.createdAt)}`,
      ]
        .filter(Boolean)
        .join(' | ')
    );
  }
  if (expenses.length > opts.limit) {
    console.log(`  ... +${expenses.length - opts.limit} más`);
  }

  // --- Cuentas corrientes ---
  const accountsSnap = await db
    .collection('schools')
    .doc(schoolId)
    .collection('vendorAccounts')
    .get();

  console.log(`\n--- vendorAccounts (${accountsSnap.size} cuentas con doc) ---`);

  const accountIds = accountsSnap.docs.map((d) => d.id);
  // También mirar vendorIds del filtro aunque no tengan doc padre
  const extraIds: string[] = [];
  if (opts.vendorId) extraIds.push(opts.vendorId, opts.vendorId.replace(/\D/g, ''));
  for (const v of vendors) extraIds.push(v.id);

  const idsToShow = Array.from(
    new Set([
      ...accountIds.filter((id) => {
        if (opts.vendorId) {
          const vid = opts.vendorId.replace(/\D/g, '');
          return id === opts.vendorId || id.replace(/\D/g, '') === vid;
        }
        if (opts.q) return matchesQuery(id, opts.q!);
        return true;
      }),
      ...(opts.q || opts.vendorId ? extraIds : []),
    ])
  ).slice(0, opts.limit);

  if (!opts.q && !opts.vendorId) {
    console.log(`  (mostrando hasta ${opts.limit} cuentas; usá --q= o --vendor= para filtrar)`);
  }

  for (const vendorId of idsToShow.length ? idsToShow : accountIds.slice(0, opts.limit)) {
    const entriesSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('vendorAccounts')
      .doc(vendorId)
      .collection('entries')
      .orderBy('date', 'asc')
      .get();

    let balance = 0;
    const rows: string[] = [];
    for (const doc of entriesSnap.docs) {
      const en = doc.data() as {
        date?: string;
        type?: string;
        description?: string;
        debit?: number;
        credit?: number;
        ref?: { expenseId?: string; paymentId?: string };
      };
      balance += (en.debit ?? 0) - (en.credit ?? 0);
      rows.push(
        `    ${shortDate(en.date)} | ${en.type ?? '-'} | debe ${money(en.debit)} | haber ${money(en.credit)} | ${en.description ?? '-'} | ref=${en.ref?.expenseId ?? en.ref?.paymentId ?? '-'}`
      );
    }

    if (opts.q && entriesSnap.empty && !matchesQuery(vendorId, opts.q) && !vendors.some((v) => v.id === vendorId)) {
      continue;
    }

    console.log(`\n  cuenta [${vendorId}] → ${entriesSnap.size} movimientos | saldo ${money(balance)}`);
    if (entriesSnap.empty) {
      console.log('    (sin movimientos)');
    } else {
      for (const r of rows) console.log(r);
    }
  }

  // --- Orphans hint: confirmed expenses whose inferred account has no matching entry ---
  console.log(`\n--- Chequeo rápido: confirmadas vs cuenta corriente ---`);
  const confirmed = expensesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as ExpRow) }))
    .filter((e) => e.status === 'confirmed' || e.status === 'paid');

  let mismatches = 0;
  for (const e of confirmed.slice(0, 80)) {
    const inferred =
      e.supplier?.vendorId ||
      (e.supplier?.cuit ? e.supplier.cuit.replace(/\D/g, '').slice(0, 20) : `temp-${e.id}`);
    if (opts.q && !matchesQuery(e.supplier?.name, opts.q) && !matchesQuery(inferred, opts.q) && !matchesQuery(e.supplier?.cuit, opts.q)) {
      continue;
    }
    const entriesSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('vendorAccounts')
      .doc(inferred)
      .collection('entries')
      .where('ref.expenseId', '==', e.id)
      .limit(1)
      .get();
    if (entriesSnap.empty) {
      mismatches++;
      console.log(
        `  ⚠ gasto ${e.id} status=${e.status} proveedor="${e.supplier?.name}" → cuenta ${inferred} SIN entry (o entry en otra cuenta)`
      );
    }
  }
  if (mismatches === 0) {
    console.log('  OK: las confirmadas revisadas tienen entry en su cuenta inferida (o no hubo match de filtro).');
  }
}

async function main() {
  const credentialsPath = resolveCredentialsPath();
  if (!credentialsPath) {
    console.error('No se encontró service-account.json / GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: projectId || undefined,
      credential: admin.credential.applicationDefault(),
    });
  }

  const { getFirestore } = await import('firebase-admin/firestore');
  // Misma DB que la app (default del proyecto), sin databaseId nombrado.
  const db = getFirestore(admin.app());

  const listOnly = hasFlag('list-schools');
  const schoolId = argValue('school');
  const q = argValue('q');
  const vendorId = argValue('vendor');
  const limit = Math.max(1, parseInt(argValue('limit') ?? '40', 10) || 40);

  if (listOnly || !schoolId) {
    await listSchools(db);
    if (!schoolId) {
      console.log('\nPasá --school=<id> para inspeccionar gastos/proveedores.');
      console.log('Ejemplo: npx tsx scripts/inspect-expenses-db.ts --school=XXXX --q=cestari');
      return;
    }
  }

  await inspectSchool(db, schoolId, { q, vendorId, limit });
  console.log('\nListo.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
