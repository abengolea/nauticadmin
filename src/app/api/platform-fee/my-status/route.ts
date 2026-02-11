/**
 * GET /api/platform-fee/my-status?schoolId=xxx
 * Obtiene el estado de mensualidad de la escuela (para mostrar aviso si está en mora).
 * Acceso: admin/coach de la escuela o super admin.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import {
  getOrCreatePlatformFeeConfig,
  getOrCreateSchoolFeeConfig,
  findApprovedSchoolFeePayment,
  getSchoolMonthlyAmount,
  getCurrentPeriod,
} from '@/lib/payments/platform-fee';
import { verifyIdToken } from '@/lib/auth-server';

function getDueDate(period: string, dayOfMonth: number): Date {
  const [y, m] = period.split('-').map(Number);
  const day = Math.min(dayOfMonth, new Date(y, m, 0).getDate());
  return new Date(y, m - 1, day);
}

function periodFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId requerido' }, { status: 400 });
    }

    const db = getAdminFirestore();

    // Verificar que el usuario pertenece a la escuela o es super admin
    const platformSnap = await db.collection('platformUsers').doc(auth.uid).get();
    const isSuperAdmin = (platformSnap.data() as { super_admin?: boolean })?.super_admin === true;

    const userInSchool = await db.collection('schools').doc(schoolId).collection('users').doc(auth.uid).get();
    const userData = userInSchool.data() as { role?: string } | undefined;
    const isSchoolAdmin = userData?.role === 'school_admin';
    if (!isSuperAdmin && (!userInSchool.exists || !isSchoolAdmin)) {
      return NextResponse.json({ error: 'Solo el administrador de la escuela puede ver el estado de mensualidad' }, { status: 403 });
    }

    const schoolConfig = await getOrCreateSchoolFeeConfig(db, schoolId);
    if (schoolConfig.isBonified) {
      return NextResponse.json({
        isBonified: true,
        inDebt: false,
        message: 'Tu escuela está bonificada.',
      });
    }

    const platformConfig = await getOrCreatePlatformFeeConfig(db);
    const monthlyAmount = await getSchoolMonthlyAmount(db, schoolId, platformConfig);
    if (monthlyAmount <= 0) {
      return NextResponse.json({
        isBonified: false,
        inDebt: false,
        message: 'Sin tarifa configurada.',
      });
    }

    const dueDay = platformConfig.dueDayOfMonth ?? 10;
    const warningDays = platformConfig.delinquencyDaysWarning ?? 5;
    const suspensionDays = platformConfig.delinquencyDaysSuspension ?? 30;
    const lateFeePct = (platformConfig.lateFeePercent ?? 5) / 100;

    const schoolSnap = await db.collection('schools').doc(schoolId).get();
    const createdAt = schoolSnap.exists && schoolSnap.data()?.createdAt
      ? (schoolSnap.data()!.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date()
      : new Date();

    const now = new Date();
    const currentPeriod = getCurrentPeriod();
    let periods: string[] = [];
    let d = new Date(createdAt.getFullYear(), createdAt.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    while (d <= end) {
      periods.push(periodFromDate(d));
      d.setMonth(d.getMonth() + 1);
    }

    const unpaid: { period: string; dueDate: string; daysOverdue: number; amount: number; lateFee: number }[] = [];

    for (const period of periods) {
      const dueDate = getDueDate(period, dueDay);
      if (dueDate > now) continue;

      const hasPaid = await findApprovedSchoolFeePayment(db, schoolId, period);
      if (hasPaid) continue;

      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
      const lateFee = Math.round(monthlyAmount * lateFeePct * Math.ceil(daysOverdue / 30));
      unpaid.push({
        period,
        dueDate: dueDate.toISOString(),
        daysOverdue,
        amount: monthlyAmount,
        lateFee,
      });
    }

    const totalDebt = unpaid.reduce((sum, u) => sum + u.amount + u.lateFee, 0);
    const maxDays = unpaid.length > 0 ? Math.max(...unpaid.map((u) => u.daysOverdue)) : 0;
    const riskSuspension = maxDays >= suspensionDays;
    const showWarning = unpaid.length > 0 && maxDays >= warningDays;

    return NextResponse.json({
      isBonified: false,
      inDebt: unpaid.length > 0,
      totalDebt,
      unpaid,
      showWarning,
      riskSuspension,
      message: unpaid.length > 0
        ? `Tenés ${unpaid.length} mensualidad(es) pendiente(s). Total: $${totalDebt} ${platformConfig.currency ?? 'ARS'}.`
        : 'Al día con las mensualidades.',
    });
  } catch (e) {
    console.error('[platform-fee/my-status]', e);
    return NextResponse.json(
      { error: 'Error al obtener estado' },
      { status: 500 }
    );
  }
}
