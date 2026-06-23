/**
 * POST /api/admin/schools/[schoolId]/register-whatsapp-phone
 *
 * Registra un teléfono en user_memberships de NotificasHub.
 * Llamado automáticamente al guardar un cliente con teléfono.
 *
 * Body: { phone: string }
 * Requiere: super_admin o school_admin
 */

import { NextResponse } from 'next/server';
import { isNotificasHubConfigured, upsertUserMembership } from '@/lib/whatsapp/user-memberships';

async function canEditSchool(uid: string, schoolId: string, email?: string): Promise<boolean> {
  if (email === 'abengolea1@gmail.com') return true;
  const { getAdminFirestore } = await import('@/lib/firebase-admin');
  const db = getAdminFirestore();
  const platformSnap = await db.collection('platformUsers').doc(uid).get();
  const platformData = platformSnap.data() as { super_admin?: boolean } | undefined;
  if (platformData?.super_admin === true) return true;
  const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${uid}`).get();
  const schoolUserData = schoolUserSnap.data() as { role?: string } | undefined;
  return schoolUserData?.role === 'school_admin';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ schoolId: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const { verifyIdToken } = await import('@/lib/auth-server');
    const auth = await verifyIdToken(authHeader);
    if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { schoolId } = await params;
    if (!schoolId?.trim()) {
      return NextResponse.json({ error: 'schoolId requerido' }, { status: 400 });
    }

    const canEdit = await canEditSchool(auth.uid, schoolId, auth.email);
    if (!canEdit) {
      return NextResponse.json(
        { error: 'Sin permisos para registrar teléfono' },
        { status: 403 }
      );
    }

    if (!isNotificasHubConfigured()) {
      return NextResponse.json(
        {
          error: 'NotificasHub no configurado. Configurá NOTIFICASHUB_PROJECT_ID, NOTIFICASHUB_CLIENT_EMAIL, NOTIFICASHUB_PRIVATE_KEY.',
        },
        { status: 503 }
      );
    }

    const body = (await request.json()) as { phone?: string };
    const phone = body?.phone?.trim();
    if (!phone) {
      return NextResponse.json({ error: 'phone es requerido' }, { status: 400 });
    }

    const res = await upsertUserMembership(phone, schoolId, auth.uid);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error ?? 'Error al registrar' },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, waId: res.waId });
  } catch (err) {
    console.error('[register-whatsapp-phone]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al registrar' },
      { status: 500 }
    );
  }
}
