/**
 * Acceso a Firestore para mensualidades de escuelas a la plataforma.
 * Solo servidor (usa firebase-admin).
 */

import type admin from 'firebase-admin';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS, PLATFORM_FEE_CONFIG_DOC, SCHOOL_FEE_CONFIG_DOC, DEFAULT_CURRENCY } from './constants';
import type { PlatformFeeConfig, SchoolFeeConfig, SchoolFeePayment, SchoolFeeDelinquent } from '@/lib/types/platform-fee';
import type { School } from '@/lib/types';

type Firestore = admin.firestore.Firestore;
type DocumentSnapshot = admin.firestore.DocumentSnapshot;

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  const t = val as { toDate?: () => Date };
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof val === 'string') return new Date(val);
  return new Date();
}

function periodFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getDueDate(period: string, dayOfMonth: number): Date {
  const [y, m] = period.split('-').map(Number);
  const day = Math.min(dayOfMonth, new Date(y, m, 0).getDate());
  return new Date(y, m - 1, day);
}

/** Obtiene el período actual (YYYY-MM). */
export function getCurrentPeriod(): string {
  return periodFromDate(new Date());
}

/** Obtiene o crea configuración global de mensualidades. */
export async function getOrCreatePlatformFeeConfig(db: Firestore): Promise<PlatformFeeConfig> {
  const ref = db.collection('platformConfig').doc(PLATFORM_FEE_CONFIG_DOC);
  const snap = await ref.get();
  if (snap.exists) {
    const d = snap.data()!;
    return {
      dueDayOfMonth: d.dueDayOfMonth ?? 10,
      delinquencyDaysWarning: d.delinquencyDaysWarning ?? 5,
      delinquencyDaysSuspension: d.delinquencyDaysSuspension ?? 30,
      lateFeePercent: d.lateFeePercent ?? 5,
      currency: d.currency ?? DEFAULT_CURRENCY,
      defaultMonthlyAmount: d.defaultMonthlyAmount ?? 0,
      updatedAt: toDate(d.updatedAt),
      updatedBy: d.updatedBy ?? '',
    };
  }
  return {
    dueDayOfMonth: 10,
    delinquencyDaysWarning: 5,
    delinquencyDaysSuspension: 30,
    lateFeePercent: 5,
    currency: DEFAULT_CURRENCY,
    defaultMonthlyAmount: 0,
    updatedAt: new Date(),
    updatedBy: '',
  };
}

/** Guarda configuración global de mensualidades. */
export async function savePlatformFeeConfig(
  db: Firestore,
  data: Omit<PlatformFeeConfig, 'updatedAt'> & { updatedAt: Date }
): Promise<void> {
  const admin = await import('firebase-admin');
  const ref = db.collection('platformConfig').doc(PLATFORM_FEE_CONFIG_DOC);
  await ref.set({
    dueDayOfMonth: data.dueDayOfMonth,
    delinquencyDaysWarning: data.delinquencyDaysWarning ?? 5,
    delinquencyDaysSuspension: data.delinquencyDaysSuspension ?? 30,
    lateFeePercent: data.lateFeePercent ?? 5,
    currency: data.currency ?? DEFAULT_CURRENCY,
    defaultMonthlyAmount: data.defaultMonthlyAmount ?? 0,
    updatedAt: admin.firestore.Timestamp.fromDate(data.updatedAt),
    updatedBy: data.updatedBy,
  });
}

/** Obtiene o crea configuración de mensualidad por escuela. */
export async function getOrCreateSchoolFeeConfig(db: Firestore, schoolId: string): Promise<SchoolFeeConfig> {
  const ref = db.collection('schools').doc(schoolId).collection('schoolFeeConfig').doc(SCHOOL_FEE_CONFIG_DOC);
  const snap = await ref.get();
  if (snap.exists) {
    const d = snap.data()!;
    return {
      monthlyAmount: d.monthlyAmount ?? 0,
      isBonified: d.isBonified ?? false,
      currency: d.currency,
      updatedAt: toDate(d.updatedAt),
      updatedBy: d.updatedBy ?? '',
    };
  }
  return {
    monthlyAmount: 0,
    isBonified: false,
    updatedAt: new Date(),
    updatedBy: '',
  };
}

/** Guarda configuración de mensualidad por escuela. */
export async function saveSchoolFeeConfig(
  db: Firestore,
  schoolId: string,
  data: Omit<SchoolFeeConfig, 'updatedAt'> & { updatedAt: Date }
): Promise<void> {
  const admin = await import('firebase-admin');
  const ref = db.collection('schools').doc(schoolId).collection('schoolFeeConfig').doc(SCHOOL_FEE_CONFIG_DOC);
  await ref.set({
    monthlyAmount: data.monthlyAmount,
    isBonified: data.isBonified ?? false,
    currency: data.currency ?? null,
    updatedAt: admin.firestore.Timestamp.fromDate(data.updatedAt),
    updatedBy: data.updatedBy,
  });
}

/** Obtiene monto base mensual para una escuela (0 si bonificada). */
export async function getSchoolMonthlyAmount(
  db: Firestore,
  schoolId: string,
  platformConfig: PlatformFeeConfig
): Promise<number> {
  const schoolConfig = await getOrCreateSchoolFeeConfig(db, schoolId);
  if (schoolConfig.isBonified) return 0;
  return schoolConfig.monthlyAmount > 0 ? schoolConfig.monthlyAmount : (platformConfig.defaultMonthlyAmount ?? 0);
}

/** Busca pago aprobado de mensualidad para escuela + período. */
export async function findApprovedSchoolFeePayment(
  db: Firestore,
  schoolId: string,
  period: string
): Promise<SchoolFeePayment | null> {
  const snap = await db
    .collection(COLLECTIONS.schoolFeePayments)
    .where('schoolId', '==', schoolId)
    .where('period', '==', period)
    .where('status', '==', 'approved')
    .get();
  if (snap.empty) return null;
  return toSchoolFeePayment(snap.docs[0]);
}

function toSchoolFeePayment(docSnap: DocumentSnapshot): SchoolFeePayment {
  const d = docSnap.data()!;
  return {
    id: docSnap.id,
    schoolId: d.schoolId,
    period: d.period,
    amount: d.amount,
    lateFeeAmount: d.lateFeeAmount,
    currency: d.currency ?? DEFAULT_CURRENCY,
    provider: d.provider ?? 'manual',
    providerPaymentId: d.providerPaymentId,
    status: d.status,
    paidAt: d.paidAt ? toDate(d.paidAt) : undefined,
    createdAt: toDate(d.createdAt),
    manualRecordedBy: d.manualRecordedBy,
  };
}

/** Crea registro de pago de mensualidad. */
export async function createSchoolFeePayment(
  db: Firestore,
  data: Omit<SchoolFeePayment, 'id' | 'createdAt'>,
  idempotencyKey?: string
): Promise<SchoolFeePayment> {
  const admin = await import('firebase-admin');
  const now = admin.firestore.Timestamp.now();
  const col = db.collection(COLLECTIONS.schoolFeePayments);

  if (idempotencyKey) {
    const ref = col.doc(idempotencyKey);
    const existing = await ref.get();
    if (existing.exists) return toSchoolFeePayment(existing);
    await ref.set({
      ...data,
      paidAt: data.paidAt ?? null,
      createdAt: now,
    });
    const snap = await ref.get();
    return toSchoolFeePayment(snap);
  }

  const ref = await col.add({
    ...data,
    paidAt: data.paidAt ?? null,
    createdAt: now,
  });
  const snap = await ref.get();
  return toSchoolFeePayment(snap);
}

/** Busca pago por provider + providerPaymentId. */
export async function findSchoolFeePaymentByProviderId(
  db: Firestore,
  provider: string,
  providerPaymentId: string
): Promise<SchoolFeePayment | null> {
  const snap = await db
    .collection(COLLECTIONS.schoolFeePayments)
    .where('provider', '==', provider)
    .where('providerPaymentId', '==', providerPaymentId)
    .get();
  if (snap.empty) return null;
  return toSchoolFeePayment(snap.docs[0]);
}

/** Genera períodos desde el mes de creación de la escuela hasta el mes actual. */
function periodsFromSchoolCreationToNow(createdAt: Date): string[] {
  const periods: string[] = [];
  const now = new Date();
  let d = new Date(createdAt.getFullYear(), createdAt.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d <= end) {
    periods.push(periodFromDate(d));
    d.setMonth(d.getMonth() + 1);
  }
  return periods;
}

/** Calcula escuelas en mora de mensualidad. */
export async function computeSchoolFeeDelinquents(db: Firestore): Promise<SchoolFeeDelinquent[]> {
  const platformConfig = await getOrCreatePlatformFeeConfig(db);
  const schoolsSnap = await db.collection('schools').get();
  const delinquents: SchoolFeeDelinquent[] = [];
  const now = new Date();
  const dueDay = platformConfig.dueDayOfMonth ?? 10;
  const lateFeePct = (platformConfig.lateFeePercent ?? 5) / 100;
  const suspensionDays = platformConfig.delinquencyDaysSuspension ?? 30;

  for (const schoolDoc of schoolsSnap.docs) {
    const schoolData = schoolDoc.data();
    const school = { id: schoolDoc.id, ...schoolData } as School & { createdAt: Date };
    const schoolId = school.id;
    const schoolConfig = await getOrCreateSchoolFeeConfig(db, schoolId);

    if (schoolConfig.isBonified) continue;

    const monthlyAmount = schoolConfig.monthlyAmount > 0
      ? schoolConfig.monthlyAmount
      : (platformConfig.defaultMonthlyAmount ?? 0);
    if (monthlyAmount <= 0) continue;

    const createdAt = school.createdAt ? toDate(school.createdAt) : new Date();
    const periods = periodsFromSchoolCreationToNow(createdAt);

    for (const period of periods) {
      const dueDate = getDueDate(period, dueDay);
      if (dueDate > now) continue;

      const hasApproved = await findApprovedSchoolFeePayment(db, schoolId, period);
      if (hasApproved) continue;

      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
      const lateFeeAmount = Math.round(monthlyAmount * lateFeePct * Math.ceil(daysOverdue / 30));
      const totalAmount = monthlyAmount + lateFeeAmount;
      const isSuspended = school.status === 'suspended' || daysOverdue >= suspensionDays;

      delinquents.push({
        schoolId,
        schoolName: school.name ?? 'Escuela',
        city: school.city ?? '',
        province: school.province ?? '',
        period,
        dueDate,
        daysOverdue,
        baseAmount: monthlyAmount,
        lateFeeAmount,
        totalAmount,
        currency: platformConfig.currency ?? DEFAULT_CURRENCY,
        isBonified: false,
        isSuspended,
      });
    }
  }

  return delinquents.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** Lista pagos de mensualidades (para super admin). */
export async function listSchoolFeePayments(
  db: Firestore,
  opts: { schoolId?: string; period?: string; limit?: number }
): Promise<SchoolFeePayment[]> {
  let q = db
    .collection(COLLECTIONS.schoolFeePayments)
    .orderBy('createdAt', 'desc') as admin.firestore.Query;

  if (opts.schoolId) q = q.where('schoolId', '==', opts.schoolId);
  if (opts.period) q = q.where('period', '==', opts.period);

  const limit = opts.limit ?? 100;
  const snap = await q.limit(limit).get();
  return snap.docs.map((d) => toSchoolFeePayment(d));
}
