/**
 * Escribe en user_memberships de NotificasHub para que WhatsApp enrute correctamente.
 * REQUIERE NOTIFICASHUB_PROJECT_ID, NOTIFICASHUB_CLIENT_EMAIL, NOTIFICASHUB_PRIVATE_KEY.
 */

import { getNotificasHubFirestore } from '@/lib/firebase-admin';
import { toWaId } from '@/lib/whatsapp/phone-utils';

export function isNotificasHubConfigured(): boolean {
  return getNotificasHubFirestore() !== null;
}

/**
 * Agrega o actualiza user_memberships/{waId} con el schoolId en tenantIds.
 * Solo escribe si NotificasHub está configurado.
 * @param phoneOrWaId - Teléfono (ej. "3364522007") o wa_id (ej. "5493364522007")
 */
export async function upsertUserMembership(
  phoneOrWaId: string,
  schoolId: string,
  updatedBy?: string
): Promise<{ ok: boolean; waId?: string; updated?: boolean; error?: string }> {
  const db = getNotificasHubFirestore();
  if (!db) {
    return {
      ok: false,
      error: 'NotificasHub no configurado. Configurá NOTIFICASHUB_PROJECT_ID, NOTIFICASHUB_CLIENT_EMAIL, NOTIFICASHUB_PRIVATE_KEY.',
    };
  }

  const waId = /^\d{10,15}$/.test(phoneOrWaId.replace(/\D/g, ''))
    ? phoneOrWaId.replace(/\D/g, '')
    : toWaId(phoneOrWaId);
  if (!waId) return { ok: false, error: 'Teléfono inválido' };

  const docRef = db.collection('user_memberships').doc(waId);
  const existing = await docRef.get();
  const currentIds = (existing.data()?.tenantIds as string[] | undefined) ?? [];
  const hasSchool = currentIds.includes(schoolId);
  if (hasSchool) return { ok: true, waId, updated: false };

  const newIds = Array.from(new Set([...currentIds, schoolId]));
  await docRef.set(
    {
      tenantIds: newIds,
      updatedAt: new Date(),
      updatedBy: updatedBy ?? 'nauticadmin',
    },
    { merge: true }
  );
  return { ok: true, waId, updated: true };
}
