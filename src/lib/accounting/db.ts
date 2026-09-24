/**
 * Cálculos de contabilidad general — solo servidor.
 */

import type admin from 'firebase-admin';
import { listPayments, getArchivedPlayerIds } from '@/lib/payments/db';
import {
  isRegistrationPeriod,
  isClothingPeriod,
  isServicePeriod,
} from '@/lib/payments/schemas';
import type { Payment } from '@/lib/types/payments';
import type {
  AccountingSummary,
  IncomeEntry,
  ClientAccountBalance,
  VendorAccountBalance,
} from './types';

type Firestore = admin.firestore.Firestore;

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  const t = val as { toDate?: () => Date };
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof val === 'string') return new Date(val);
  return new Date();
}

function paymentEffectiveDate(p: Payment): Date {
  return p.paidAt ?? p.createdAt;
}

function inPeriod(date: Date, year: number, month?: number): boolean {
  if (month != null) {
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  }
  return date.getFullYear() === year;
}

function categorizePayment(p: Payment): keyof AccountingSummary['income']['byCategory'] {
  const type = p.paymentType;
  if (type === 'registration' || isRegistrationPeriod(p.period)) return 'inscripcion';
  if (type === 'clothing' || isClothingPeriod(p.period)) return 'ropa';
  if (type === 'service' || isServicePeriod(p.period)) return 'servicios';
  if (type === 'monthly' || /^\d{4}-\d{2}$/.test(p.period)) return 'cuotas';
  return 'otros';
}

function expenseEffectiveDate(data: Record<string, unknown>): Date {
  const issueDate = (data.invoice as { issueDate?: string } | undefined)?.issueDate;
  if (issueDate) return new Date(issueDate);
  return toDate(data.createdAt);
}

function sumEntryDocs(
  docs: admin.firestore.QueryDocumentSnapshot[]
): { net: number; count: number } {
  let net = 0;
  docs.forEach((d) => {
    const data = d.data();
    net += (data.debit ?? 0) - (data.credit ?? 0);
  });
  return { net, count: docs.length };
}

/** Suma saldos sin collection group (no requiere índice compuesto en Firestore). */
async function sumCuentaCorrienteBalances(
  db: Firestore,
  schoolId: string,
  archivedPlayerIds: Set<string>
): Promise<AccountingSummary['cuentaCorriente']> {
  const schoolRef = db.collection('schools').doc(schoolId);

  // --- Clientes: entries por player ---
  let clientNet = 0;
  let clientMoves = 0;
  const playersSnap = await schoolRef.collection('players').select('archived').get();
  const playerIds = playersSnap.docs
    .map((d) => d.id)
    .filter((id) => !archivedPlayerIds.has(id));

  await Promise.all(
    playerIds.map(async (playerId) => {
      const entriesSnap = await schoolRef
        .collection('clientAccounts')
        .doc(playerId)
        .collection('entries')
        .get();
      if (entriesSnap.empty) return;
      const { net, count } = sumEntryDocs(entriesSnap.docs);
      clientNet += net;
      clientMoves += count;
    })
  );

  // --- Proveedores: IDs desde catálogo, gastos y pagos ---
  const vendorIds = new Set<string>();
  const [vendorsSnap, expensesSnap, vendorPaymentsSnap] = await Promise.all([
    schoolRef.collection('expenseVendors').select('name').get(),
    schoolRef.collection('expenses').select('supplier').get(),
    schoolRef.collection('expensePayments').select('vendorId').get(),
  ]);

  vendorsSnap.docs.forEach((d) => vendorIds.add(d.id));
  expensesSnap.docs.forEach((d) => {
    const supplier = d.data().supplier as { vendorId?: string; cuit?: string } | undefined;
    if (supplier?.vendorId) vendorIds.add(supplier.vendorId);
    else if (supplier?.cuit) {
      vendorIds.add(supplier.cuit.replace(/\D/g, '').slice(0, 20));
    }
  });
  vendorPaymentsSnap.docs.forEach((d) => {
    const vendorId = d.data().vendorId as string | undefined;
    if (vendorId) vendorIds.add(vendorId);
  });

  let vendorNet = 0;
  let vendorMoves = 0;
  await Promise.all(
    [...vendorIds].map(async (vendorId) => {
      const entriesSnap = await schoolRef
        .collection('vendorAccounts')
        .doc(vendorId)
        .collection('entries')
        .get();
      if (entriesSnap.empty) return;
      const { net, count } = sumEntryDocs(entriesSnap.docs);
      vendorNet += net;
      vendorMoves += count;
    })
  );

  return {
    clientes: { saldoTotal: clientNet, movimientos: clientMoves },
    proveedores: { saldoTotal: vendorNet, movimientos: vendorMoves },
  };
}

export async function getAccountingSummary(
  db: Firestore,
  schoolId: string,
  year: number,
  month?: number
): Promise<AccountingSummary> {
  const archivedIds = await getArchivedPlayerIds(db, schoolId);

  const { payments } = await listPayments(db, schoolId, {
    status: 'approved',
    limit: 10000,
    offset: 0,
  });

  const byCategory = {
    cuotas: 0,
    inscripcion: 0,
    servicios: 0,
    ropa: 0,
    otros: 0,
  };

  let incomeTotal = 0;
  let incomeCount = 0;

  payments
    .filter((p) => !archivedIds.has(p.playerId))
    .filter((p) => inPeriod(paymentEffectiveDate(p), year, month))
    .forEach((p) => {
      incomeTotal += p.amount;
      incomeCount++;
      byCategory[categorizePayment(p)] += p.amount;
    });

  // Ingresos manuales (hielo, etc.)
  const incomeSnap = await db
    .collection('schools')
    .doc(schoolId)
    .collection('incomeEntries')
    .get();

  incomeSnap.docs.forEach((d) => {
    const data = d.data();
    const date = toDate(data.date);
    if (!inPeriod(date, year, month)) return;
    const amount = data.amount ?? 0;
    incomeTotal += amount;
    incomeCount++;
    byCategory.otros += amount;
  });

  // Gastos confirmados o pagados
  const expensesSnap = await db
    .collection('schools')
    .doc(schoolId)
    .collection('expenses')
    .where('status', 'in', ['confirmed', 'paid'])
    .get();

  let expensesTotal = 0;
  let expensesCount = 0;

  expensesSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.archivedAt) return;
    const date = expenseEffectiveDate(data);
    if (!inPeriod(date, year, month)) return;
    expensesTotal += data.amounts?.total ?? 0;
    expensesCount++;
  });

  const cuentaCorriente = await sumCuentaCorrienteBalances(db, schoolId, archivedIds);

  return {
    period: { year, month },
    income: {
      total: incomeTotal,
      currency: 'ARS',
      count: incomeCount,
      byCategory,
    },
    expenses: {
      total: expensesTotal,
      count: expensesCount,
      currency: 'ARS',
    },
    result: incomeTotal - expensesTotal,
    cuentaCorriente,
  };
}

async function getVendorIdsAndNames(
  db: Firestore,
  schoolId: string
): Promise<Map<string, { name: string; cuentaCorrienteHabilitada: boolean }>> {
  const schoolRef = db.collection('schools').doc(schoolId);
  const map = new Map<string, { name: string; cuentaCorrienteHabilitada: boolean }>();

  const [vendorsSnap, expensesSnap, vendorPaymentsSnap] = await Promise.all([
    schoolRef.collection('expenseVendors').get(),
    schoolRef.collection('expenses').select('supplier').get(),
    schoolRef.collection('expensePayments').select('vendorId').get(),
  ]);

  vendorsSnap.docs.forEach((d) => {
    const data = d.data();
    map.set(d.id, {
      name: (data.name as string) || d.id,
      cuentaCorrienteHabilitada: data.cuentaCorrienteHabilitada !== false,
    });
  });

  expensesSnap.docs.forEach((d) => {
    const supplier = d.data().supplier as {
      vendorId?: string;
      cuit?: string;
      name?: string;
    } | undefined;
    const vendorId =
      supplier?.vendorId ||
      (supplier?.cuit ? supplier.cuit.replace(/\D/g, '').slice(0, 20) : undefined);
    if (!vendorId) return;
    if (!map.has(vendorId)) {
      map.set(vendorId, {
        name: supplier?.name?.trim() || vendorId,
        cuentaCorrienteHabilitada: true,
      });
    }
  });

  vendorPaymentsSnap.docs.forEach((d) => {
    const vendorId = d.data().vendorId as string | undefined;
    if (vendorId && !map.has(vendorId)) {
      map.set(vendorId, { name: vendorId, cuentaCorrienteHabilitada: true });
    }
  });

  return map;
}

export async function listClientAccountBalances(
  db: Firestore,
  schoolId: string,
  q?: string
): Promise<ClientAccountBalance[]> {
  const schoolRef = db.collection('schools').doc(schoolId);
  const archivedIds = await getArchivedPlayerIds(db, schoolId);
  const playersSnap = await schoolRef.collection('players').get();
  const query = q?.trim().toLowerCase() ?? '';

  const results = await Promise.all(
    playersSnap.docs
      .filter((d) => !archivedIds.has(d.id))
      .map(async (playerDoc) => {
        const data = playerDoc.data();
        const firstName = (data.firstName as string) ?? '';
        const lastName = (data.lastName as string) ?? '';
        const name = `${lastName} ${firstName}`.trim() || playerDoc.id;

        if (query && !name.toLowerCase().includes(query)) return null;

        const entriesSnap = await schoolRef
          .collection('clientAccounts')
          .doc(playerDoc.id)
          .collection('entries')
          .get();
        const { net, count } = sumEntryDocs(entriesSnap.docs);

        return {
          playerId: playerDoc.id,
          name,
          balance: net,
          movimientos: count,
          creditoActivo: data.creditoActivo !== false,
        } satisfies ClientAccountBalance;
      })
  );

  return results
    .filter((r): r is ClientAccountBalance => r != null)
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, 'es'));
}

export async function listVendorAccountBalances(
  db: Firestore,
  schoolId: string,
  q?: string
): Promise<VendorAccountBalance[]> {
  const schoolRef = db.collection('schools').doc(schoolId);
  const vendorMap = await getVendorIdsAndNames(db, schoolId);
  const query = q?.trim().toLowerCase() ?? '';

  const results = await Promise.all(
    [...vendorMap.entries()]
      .filter(([vendorId, meta]) => {
        if (!query) return true;
        return (
          meta.name.toLowerCase().includes(query) ||
          vendorId.toLowerCase().includes(query)
        );
      })
      .map(async ([vendorId, meta]) => {
        const entriesSnap = await schoolRef
          .collection('vendorAccounts')
          .doc(vendorId)
          .collection('entries')
          .get();
        const { net, count } = sumEntryDocs(entriesSnap.docs);

        return {
          vendorId,
          name: meta.name,
          balance: net,
          movimientos: count,
          cuentaCorrienteHabilitada: meta.cuentaCorrienteHabilitada,
        } satisfies VendorAccountBalance;
      })
  );

  return results.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, 'es'));
}

export async function listIncomeEntries(
  db: Firestore,
  schoolId: string,
  year: number,
  month?: number
): Promise<IncomeEntry[]> {
  const snap = await db
    .collection('schools')
    .doc(schoolId)
    .collection('incomeEntries')
    .orderBy('date', 'desc')
    .get();

  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        schoolId: data.schoolId,
        date: data.date,
        amount: data.amount,
        currency: data.currency ?? 'ARS',
        concept: data.concept,
        category: data.category,
        createdAt: data.createdAt,
        createdBy: data.createdBy,
      } as IncomeEntry;
    })
    .filter((e) => inPeriod(toDate(e.date), year, month));
}
