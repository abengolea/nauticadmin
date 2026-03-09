/**
 * Busca clientes (players) en la base de la náutica por teléfono WhatsApp.
 * Usado por el bot para identificar al usuario antes del flujo de pago manual.
 */

import { getAdminFirestore } from '@/lib/firebase-admin';
import { toWaId } from '@/lib/whatsapp/phone-utils';

export interface ClientMatch {
  id: string;
  name: string;
}

/**
 * Busca jugadores/clientes cuya tutorContact.phone coincida con el wa_id.
 * Para náuticas: los clientes están en schools/{schoolId}/players con tutorContact.phone.
 */
export async function findClientsByPhone(
  schoolId: string,
  waId: string
): Promise<ClientMatch[]> {
  const db = getAdminFirestore();
  const digits = waId.replace(/\D/g, '');

  const playersSnap = await db
    .collection('schools')
    .doc(schoolId)
    .collection('players')
    .where('status', 'in', ['active', 'suspended'])
    .get();

  const matches: ClientMatch[] = [];
  for (const doc of playersSnap.docs) {
    const d = doc.data();
    const tutorPhone = (d.tutorContact as { phone?: string } | undefined)?.phone?.trim();
    if (!tutorPhone) continue;
    const playerWaId = toWaId(tutorPhone);
    if (playerWaId === digits || playerWaId === waId) {
      const firstName = d.firstName ?? '';
      const lastName = d.lastName ?? '';
      const tutorName = (d.tutorContact as { name?: string })?.name ?? '';
      const name = tutorName.trim() || `${firstName} ${lastName}`.trim() || 'Sin nombre';
      matches.push({ id: doc.id, name });
    }
  }
  return matches;
}
