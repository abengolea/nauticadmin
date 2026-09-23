/**
 * Operaciones de cuenta corriente de clientes — solo servidor.
 */

import type admin from 'firebase-admin';
import type { Payment } from '@/lib/types/payments';
import type { ClientAccountEntry, ClientAccountEntryType } from './types';
import {
  isRegistrationPeriod,
  isClothingPeriod,
  isServicePeriod,
} from '@/lib/payments/schemas';
import { REGISTRATION_PERIOD } from '@/lib/payments/constants';

type Firestore = admin.firestore.Firestore;

function entriesCol(db: Firestore, schoolId: string, playerId: string) {
  return db
    .collection('schools')
    .doc(schoolId)
    .collection('clientAccounts')
    .doc(playerId)
    .collection('entries');
}

/** Si creditoActivo es false explícitamente, no registrar movimientos. */
export async function isClientAccountEnabled(
  db: Firestore,
  schoolId: string,
  playerId: string
): Promise<boolean> {
  const snap = await db
    .collection('schools')
    .doc(schoolId)
    .collection('players')
    .doc(playerId)
    .get();
  if (!snap.exists) return false;
  const creditoActivo = (snap.data() as { creditoActivo?: boolean })?.creditoActivo;
  return creditoActivo !== false;
}

function periodChargeDescription(period: string, paymentType?: string): string {
  if (isRegistrationPeriod(period)) return 'Derecho de inscripción';
  if (isClothingPeriod(period)) return `Cuota ropa (${period})`;
  if (isServicePeriod(period)) return 'Servicio / concepto';
  if (paymentType === 'service') return 'Servicio / concepto';
  if (/^\d{4}-\d{2}$/.test(period)) return `Cuota mensual ${period}`;
  return `Cargo ${period}`;
}

function paymentCreditDescription(payment: Payment): string {
  const concept = payment.metadata?.concept as string | undefined;
  if (concept?.trim()) return `Cobro: ${concept.trim()}`;
  if (isRegistrationPeriod(payment.period)) return 'Cobro inscripción';
  if (isClothingPeriod(payment.period)) return `Cobro ropa (${payment.period})`;
  if (isServicePeriod(payment.period) || payment.paymentType === 'service') {
    return concept?.trim() ? `Cobro: ${concept}` : 'Cobro servicio';
  }
  if (/^\d{4}-\d{2}$/.test(payment.period)) return `Cobro cuota ${payment.period}`;
  return `Cobro ${payment.period}`;
}

function toDateStr(val: Date | undefined): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  return val.toISOString().slice(0, 10);
}

async function entryExists(
  db: Firestore,
  schoolId: string,
  playerId: string,
  entryId: string
): Promise<boolean> {
  const snap = await entriesCol(db, schoolId, playerId).doc(entryId).get();
  return snap.exists;
}

export async function createClientAccountEntry(
  db: Firestore,
  params: {
    schoolId: string;
    playerId: string;
    entryId?: string;
    date: string;
    type: ClientAccountEntryType;
    debit: number;
    credit: number;
    description: string;
    ref?: ClientAccountEntry['ref'];
    receiptStoragePath?: string;
  }
): Promise<string | null> {
  const enabled = await isClientAccountEnabled(db, params.schoolId, params.playerId);
  if (!enabled) return null;

  const col = entriesCol(db, params.schoolId, params.playerId);
  const entryRef = params.entryId ? col.doc(params.entryId) : col.doc();
  if (params.entryId && (await entryRef.get()).exists) return params.entryId;

  const entryId = entryRef.id;
  const entry: Omit<ClientAccountEntry, 'balanceAfter'> = {
    id: entryId,
    playerId: params.playerId,
    schoolId: params.schoolId,
    date: params.date,
    type: params.type,
    ref: params.ref ?? {},
    debit: params.debit,
    credit: params.credit,
    description: params.description,
    createdAt: new Date().toISOString(),
  };
  if (params.receiptStoragePath) entry.receiptStoragePath = params.receiptStoragePath;

  await entryRef.set(entry);
  return entryId;
}

/** Registra cobro (haber) y cargo asociado (debe) al aprobar un pago. */
export async function recordPaymentInClientAccount(
  db: Firestore,
  payment: Payment
): Promise<void> {
  if (payment.status !== 'approved') return;

  const { schoolId, playerId, id: paymentId } = payment;
  const enabled = await isClientAccountEnabled(db, schoolId, playerId);
  if (!enabled) return;

  const date = toDateStr(payment.paidAt ?? payment.createdAt);
  const amount = payment.amount;

  // Cargo (debe): cuota/servicio/inscripción
  const isService = isServicePeriod(payment.period) || payment.paymentType === 'service';
  const concept = payment.metadata?.concept as string | undefined;

  if (isService && concept?.trim()) {
    await createClientAccountEntry(db, {
      schoolId,
      playerId,
      entryId: `charge-${paymentId}`,
      date,
      type: 'invoice',
      debit: amount,
      credit: 0,
      description: concept.trim(),
      ref: { paymentId, period: payment.period },
    });
  } else if (!isService) {
    const periodKey = payment.period.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    await createClientAccountEntry(db, {
      schoolId,
      playerId,
      entryId: `period-${periodKey}`,
      date,
      type: payment.period === REGISTRATION_PERIOD ? 'invoice' : 'monthly_fee',
      debit: amount,
      credit: 0,
      description: periodChargeDescription(payment.period, payment.paymentType),
      ref: { period: payment.period },
    });
  }

  // Cobro (haber)
  await createClientAccountEntry(db, {
    schoolId,
    playerId,
    entryId: `pay-${paymentId}`,
    date,
    type: 'payment',
    debit: 0,
    credit: amount,
    description: paymentCreditDescription(payment),
    ref: { paymentId, period: payment.period },
    receiptStoragePath: payment.documentoAdjuntoStoragePath,
  });
}

/** Registra en cuenta corriente a partir del ID de un pago ya persistido. */
export async function recordPaymentInClientAccountById(
  db: Firestore,
  paymentId: string
): Promise<void> {
  const snap = await db.collection('payments').doc(paymentId).get();
  if (!snap.exists) return;
  const d = snap.data()!;
  const toDate = (val: unknown): Date | undefined => {
    if (!val) return undefined;
    if (val instanceof Date) return val;
    const t = val as { toDate?: () => Date };
    if (typeof t?.toDate === 'function') return t.toDate();
    if (typeof val === 'string') return new Date(val);
    return undefined;
  };
  const payment: Payment = {
    id: snap.id,
    playerId: d.playerId,
    schoolId: d.schoolId,
    period: d.period,
    amount: d.amount,
    currency: d.currency ?? 'ARS',
    provider: d.provider,
    providerPaymentId: d.providerPaymentId,
    status: d.status,
    paidAt: toDate(d.paidAt),
    createdAt: toDate(d.createdAt) ?? new Date(),
    metadata: d.metadata,
    paymentType: d.paymentType,
    documentoAdjuntoStoragePath: d.documentoAdjuntoStoragePath,
  };
  await recordPaymentInClientAccount(db, payment);
}

export async function getClientAccountWithBalance(
  db: Firestore,
  schoolId: string,
  playerId: string
): Promise<{ entries: ClientAccountEntry[]; balance: number }> {
  const snap = await entriesCol(db, schoolId, playerId)
    .orderBy('date', 'asc')
    .orderBy('createdAt', 'asc')
    .get();

  const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClientAccountEntry));
  let balance = 0;
  const entriesWithBalance = entries.map((e) => {
    balance += e.debit - e.credit;
    return { ...e, balanceAfter: balance };
  });

  return { entries: entriesWithBalance, balance };
}
