/**
 * GET /api/duplicate-cases/[caseId]?schoolId=xxx
 * Obtiene detalle de un caso de duplicado.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { getDuplicateCase } from '@/lib/duplicate-payments/duplicate-case-db';
import { getPlayerNames } from '@/lib/payments/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { caseId } = await params;
    const url = new URL(request.url);
    const schoolId = url.searchParams.get('schoolId');
    if (!schoolId || schoolId.trim() === '') {
      return NextResponse.json({ error: 'schoolId requerido' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const schoolUserSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('users')
      .doc(auth.uid)
      .get();

    if (!schoolUserSnap.exists) {
      return NextResponse.json({ error: 'Sin acceso a esta escuela' }, { status: 403 });
    }

    const duplicateCase = await getDuplicateCase(db, caseId);
    if (!duplicateCase) {
      return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 });
    }

    if (duplicateCase.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Caso no pertenece a esta escuela' }, { status: 403 });
    }

    // Obtener datos de pagos
    const paymentsCol = db.collection('payments');
    const paymentSnaps = await Promise.all(
      duplicateCase.paymentIds.map((id) => paymentsCol.doc(id).get())
    );
    const payments = paymentSnaps
      .filter((s) => s.exists)
      .map((s) => {
        const d = s!.data()!;
        return {
          id: s!.id,
          amount: d.amount,
          currency: d.currency ?? 'ARS',
          paidAt: d.paidAt?.toDate?.() ?? d.paidAt,
          provider: d.provider,
          providerPaymentId: d.providerPaymentId,
          period: d.period,
        };
      });

    const playerNames = await getPlayerNames(db, schoolId, [duplicateCase.customerId]);
    const customerName = playerNames.get(duplicateCase.customerId) ?? duplicateCase.customerId;

    return NextResponse.json({
      case: duplicateCase,
      payments,
      customerName,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/duplicate-cases/[caseId]]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
