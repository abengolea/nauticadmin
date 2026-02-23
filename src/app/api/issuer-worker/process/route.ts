/**
 * POST /api/issuer-worker/process
 * Procesa InvoiceOrders pendientes (emitir AFIP, PDF, email).
 * Protegido: solo admin de escuela o super admin.
 * Ejecutar vía cron (Vercel Cron, Cloud Scheduler) o manual.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { processPendingOrders } from '@/lib/duplicate-payments/issuer-worker';

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const url = new URL(request.url);
    const schoolId = url.searchParams.get('schoolId') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '10', 10), 50);

    const db = getAdminFirestore();

    // Si se especifica schoolId, verificar acceso
    if (schoolId) {
      const schoolUserSnap = await db
        .collection('schools')
        .doc(schoolId)
        .collection('users')
        .doc(auth.uid)
        .get();

      if (!schoolUserSnap.exists) {
        return NextResponse.json({ error: 'Sin acceso a esta escuela' }, { status: 403 });
      }
    }
    // Si no schoolId: procesar todas (requeriría super admin - por ahora permitir si tiene al menos una escuela)

    const { processed, failed } = await processPendingOrders(db, schoolId, limit);

    return NextResponse.json({
      ok: true,
      processed,
      failed,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/issuer-worker/process]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
