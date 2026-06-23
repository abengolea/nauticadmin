/**
 * POST /api/payments/service-charge
 * Carga un concepto/servicio facturado esporádico (ej: Lavado de Lancha, venta de insumos).
 * Crea el pago y envía email al cliente con la actividad realizada.
 */

import { NextResponse } from 'next/server';
import type admin from 'firebase-admin';
import { serviceChargeSchema } from '@/lib/payments/schemas';
import { getAdminFirestore } from '@/lib/firebase-admin';
import {
  createPayment,
  playerExistsInSchool,
} from '@/lib/payments/db';
import { buildEmailHtmlServer } from '@/lib/email-template-server';
import { escapeHtml } from '@/lib/email';
import { verifyIdToken } from '@/lib/auth-server';

const MAIL_COLLECTION = 'mail';

function enqueueMail(
  db: admin.firestore.Firestore,
  payload: { to: string; subject: string; html: string; text?: string }
): Promise<void> {
  return db.collection(MAIL_COLLECTION).add({
    to: payload.to,
    message: {
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? payload.html.replace(/<[^>]+>/g, ''),
    },
  }) as Promise<void>;
}

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = serviceChargeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { playerId, schoolId, concept, amount, currency } = parsed.data;
    const periodMonth = parsed.data.period ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const db = getAdminFirestore();

    const playerExists = await playerExistsInSchool(db, schoolId, playerId);
    if (!playerExists) {
      return NextResponse.json(
        { error: 'El cliente no existe en esta náutica.' },
        { status: 400 }
      );
    }

    // Period único para cada concepto: extra-YYYYMM-timestamp
    const period = `extra-${periodMonth.replace('-', '')}-${Date.now()}`;

    let collectedByDisplayName = auth.email ?? 'Usuario';
    const schoolUserRef = db
      .collection('schools')
      .doc(schoolId)
      .collection('users')
      .doc(auth.uid);
    const schoolUserSnap = await schoolUserRef.get();
    if (schoolUserSnap.exists) {
      const displayName = (schoolUserSnap.data() as { displayName?: string })?.displayName?.trim();
      if (displayName) collectedByDisplayName = displayName;
    }

    const now = new Date();
    const payment = await createPayment(db, {
      playerId,
      schoolId,
      period,
      amount,
      currency,
      provider: 'manual',
      status: 'approved',
      paidAt: now,
      paymentType: 'service',
      metadata: {
        concept,
        servicePeriod: periodMonth,
        collectedByUid: auth.uid,
        collectedByEmail: auth.email ?? '',
        collectedByDisplayName,
      },
    });

    // Enviar email al cliente con la actividad realizada
    const playerRef = db
      .collection('schools')
      .doc(schoolId)
      .collection('players')
      .doc(playerId);
    const playerSnap = await playerRef.get();
    const playerData = playerSnap.data();
    const playerName = playerData
      ? `${playerData.firstName ?? ''} ${playerData.lastName ?? ''}`.trim()
      : 'Cliente';
    const toEmail = playerData?.email?.trim?.();

    if (toEmail) {
      const amountStr = `${currency} ${amount.toLocaleString('es-AR')}`;
      const subject = `Servicio facturado: ${concept} - NauticAdmin`;
      const contentHtml = `
        <p>Hola ${escapeHtml(playerName)},</p>
        <p>Te informamos que se ha cargado el siguiente concepto a tu cuenta:</p>
        <p><strong>Actividad realizada:</strong> ${escapeHtml(concept)}</p>
        <p><strong>Monto:</strong> ${amountStr}</p>
        <p><strong>Fecha:</strong> ${now.toLocaleDateString('es-AR')}</p>
        <p>Este concepto se incluirá en tu próxima facturación.</p>
      `;
      const html = buildEmailHtmlServer(contentHtml, {
        title: 'NauticAdmin',
        greeting: `Estimado/a ${escapeHtml(playerName)}:`,
      });
      await enqueueMail(db, {
        to: toEmail,
        subject,
        html,
      });
    }

    return NextResponse.json({
      paymentId: payment.id,
      status: payment.status,
      paidAt: payment.paidAt,
      concept,
      emailSent: !!toEmail,
    });
  } catch (e) {
    console.error('[payments/service-charge]', e);
    return NextResponse.json(
      { error: 'Error al cargar el concepto' },
      { status: 500 }
    );
  }
}
