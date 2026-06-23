/**
 * POST /api/admin/schools/[schoolId]/sync-whatsapp-memberships
 *
 * Sincroniza los teléfonos de clientes (tutorContact.phone) a la colección
 * user_memberships de NotificasHub, para que WhatsApp identifique clientes activos.
 *
 * Requiere: super_admin o school_admin
 * Requiere: NOTIFICASHUB_PROJECT_ID, NOTIFICASHUB_CLIENT_EMAIL, NOTIFICASHUB_PRIVATE_KEY en env.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { isNotificasHubConfigured, upsertUserMembership } from '@/lib/whatsapp/user-memberships';
import { toWaId } from '@/lib/whatsapp/phone-utils';

async function canEditSchool(uid: string, schoolId: string, email?: string): Promise<boolean> {
  if (email === 'abengolea1@gmail.com') return true;
  const db = getAdminFirestore();
  const platformSnap = await db.collection('platformUsers').doc(uid).get();
  const platformData = platformSnap.data() as { super_admin?: boolean } | undefined;
  if (platformData?.super_admin === true) return true;
  const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${uid}`).get();
  const schoolUserData = schoolUserSnap.data() as { role?: string } | undefined;
  return schoolUserData?.role === 'school_admin';
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ schoolId: string }> }
) {
  try {
    const authHeader = _request.headers.get('Authorization');
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
        { error: 'Solo super admin o administrador de la náutica puede sincronizar' },
        { status: 403 }
      );
    }

    if (!isNotificasHubConfigured()) {
      return NextResponse.json(
        {
          error: 'NotificasHub no está configurado. Configurá NOTIFICASHUB_PROJECT_ID, NOTIFICASHUB_CLIENT_EMAIL, NOTIFICASHUB_PRIVATE_KEY en las variables de entorno de App Hosting.',
        },
        { status: 503 }
      );
    }

    const db = getAdminFirestore();
    const playersSnap = await db.collection(`schools/${schoolId}/players`).get();

    const membershipsByPhone = new Map<string, Set<string>>();

    for (const doc of playersSnap.docs) {
      const data = doc.data() as { tutorContact?: { phone?: string }; status?: string } | undefined;
      const phone = data?.tutorContact?.phone?.trim();
      if (!phone) continue;

      const waId = toWaId(phone);
      if (!waId) continue;

      if (!membershipsByPhone.has(waId)) {
        membershipsByPhone.set(waId, new Set());
      }
      membershipsByPhone.get(waId)!.add(schoolId);
    }

    let updated = 0;
    for (const [waId, tenantIds] of membershipsByPhone) {
      for (const tid of tenantIds) {
        const res = await upsertUserMembership(waId, tid, auth.uid);
        if (res.ok && res.updated) updated++;
      }
    }

    return NextResponse.json({
      ok: true,
      playersWithPhone: membershipsByPhone.size,
      membershipsUpdated: updated,
    });
  } catch (err) {
    console.error('[sync-whatsapp-memberships]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al sincronizar' },
      { status: 500 }
    );
  }
}
