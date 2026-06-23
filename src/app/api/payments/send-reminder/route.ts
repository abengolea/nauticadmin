/**
 * POST /api/payments/send-reminder
 * Envía emails masivos a no aplicados o morosos.
 * Body: { schoolId: string, type: 'unapplied' | 'delinquents' }
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { computeDelinquents } from '@/lib/payments/db';
import { buildEmailHtml, escapeHtml } from '@/lib/email';

const MAIL_COLLECTION = 'mail';

async function enqueueMail(
  db: ReturnType<typeof getAdminFirestore>,
  payload: { to: string; subject: string; html: string; text?: string }
): Promise<void> {
  await db.collection(MAIL_COLLECTION).add({
    to: payload.to,
    message: {
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? payload.html.replace(/<[^>]+>/g, ''),
    },
  });
}

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { schoolId, type } = body as { schoolId?: string; type?: string };

    if (!schoolId || !type) {
      return NextResponse.json(
        { error: 'Faltan schoolId o type (unapplied | delinquents)' },
        { status: 400 }
      );
    }

    if (type !== 'unapplied' && type !== 'delinquents') {
      return NextResponse.json({ error: 'type debe ser unapplied o delinquents' }, { status: 400 });
    }

    const db = getAdminFirestore();

    // Verificar permisos (school_admin o super_admin)
    const uid = auth.uid;
    const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${uid}`).get();
    const platformUserSnap = await db.doc(`platformUsers/${uid}`).get();
    const isSchoolAdmin =
      schoolUserSnap.exists &&
      (schoolUserSnap.data() as { role?: string })?.role === 'school_admin';
    const isSuperAdmin =
      platformUserSnap.exists &&
      (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true;

    if (!isSchoolAdmin && !isSuperAdmin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    let sent = 0;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

    if (type === 'unapplied') {
      const unappliedRef = db.collection('schools').doc(schoolId).collection('unappliedPayments');
      const snap = await unappliedRef.orderBy('importedAt', 'desc').limit(500).get();
      const playerIds = [...new Set(snap.docs.map((d) => (d.data().playerId as string) ?? '').filter(Boolean))];

      const playersRef = db.collection('schools').doc(schoolId).collection('players');
      const playerEmails = new Map<string, { email: string; name: string }>();
      for (const pid of playerIds) {
        const playerSnap = await playersRef.doc(pid).get();
        if (playerSnap.exists) {
          const d = playerSnap.data()!;
          const email = (d.email as string)?.trim();
          const name = `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || 'cliente';
          if (email && email.includes('@')) {
            playerEmails.set(pid, { email, name });
          }
        }
      }

      const subject = 'Pago sin aplicar - Escuelas River SN';
      const sentEmails = new Set<string>();
      for (const [, { email, name }] of playerEmails) {
        const emailNorm = email.toLowerCase();
        if (sentEmails.has(emailNorm)) continue;
        sentEmails.add(emailNorm);
        const contentHtml = `
          <p>Hola <strong>${escapeHtml(name)}</strong>,</p>
          <p>Hemos detectado un pago que no pudo aplicarse a tu cuenta. Por favor contactá a la administración de la escuela para regularizar tu situación.</p>
          <p><a href="${escapeHtml(baseUrl)}/dashboard" style="color: #d4002a; font-weight: bold;">Ir al panel</a></p>
        `;
        const html = buildEmailHtml(contentHtml, {
          title: subject,
          greeting: '',
          baseUrl,
        });
        await enqueueMail(db, {
          to: email,
          subject,
          html,
          text: contentHtml.replace(/<[^>]+>/g, ''),
        });
        sent++;
      }
    } else {
      const delinquents = await computeDelinquents(db, schoolId);
      const withEmail = delinquents.filter((d) => d.playerEmail?.trim()?.includes('@'));
      const sentEmails = new Set<string>();

      for (const d of withEmail) {
        const emailNorm = d.playerEmail!.trim().toLowerCase();
        if (sentEmails.has(emailNorm)) continue;
        sentEmails.add(emailNorm);
        const email = d.playerEmail!.trim();
        const amountStr = `${d.currency} ${d.amount.toLocaleString('es-AR')}`;
        const subject = `Aviso de mora - Cuota ${d.period} - Escuelas River SN`;
        const contentHtml = `
          <p>Hola <strong>${escapeHtml(d.playerName)}</strong>,</p>
          <p>Te recordamos que la cuota correspondiente al período <strong>${d.period}</strong> (${amountStr}) se encuentra en mora.</p>
          <p>Por favor regularizá tu situación de pago lo antes posible para continuar participando en las actividades.</p>
          <p><a href="${escapeHtml(baseUrl)}/dashboard/payments" style="color: #d4002a; font-weight: bold;">Ir a pagos</a></p>
          <p>Si ya realizaste el pago, ignora este mensaje.</p>
        `;
        const html = buildEmailHtml(contentHtml, {
          title: subject,
          greeting: `Estimado/a responsable de ${escapeHtml(d.playerName)}:`,
          baseUrl,
        });
        await enqueueMail(db, {
          to: email,
          subject,
          html,
          text: contentHtml.replace(/<[^>]+>/g, ''),
        });
        sent++;
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      message: type === 'unapplied'
        ? `Se encolaron ${sent} correos a clientes con pagos no aplicados.`
        : `Se encolaron ${sent} correos a morosos.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[payments/send-reminder]', e);
    return NextResponse.json(
      { error: 'Error al enviar recordatorios', detail: message },
      { status: 500 }
    );
  }
}
