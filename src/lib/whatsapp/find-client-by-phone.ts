/**
 * Busca clientes (players) en la base de la náutica por teléfono WhatsApp.
 * Usado por el bot para identificar al usuario antes del flujo de pago manual.
 */

import { getAdminFirestore } from '@/lib/firebase-admin';
import { getContactPhones } from '@/lib/contact-phones';
import { toWaId } from '@/lib/whatsapp/phone-utils';

export interface ClientMatch {
  id: string;
  name: string;
}

/**
 * Busca clientes cuya tutorContact.phone / phones coincida con el wa_id.
 * Para náuticas: los clientes están en schools/{schoolId}/players con tutorContact.
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
    const tutorContact = d.tutorContact as
      | { name?: string; phone?: string; phones?: string[] }
      | undefined;
    const phones = getContactPhones(tutorContact);
    const matchesPhone = phones.some((phone) => {
      const playerWaId = toWaId(phone);
      return playerWaId === digits || playerWaId === waId;
    });
    if (!matchesPhone) continue;

    const firstName = d.firstName ?? '';
    const lastName = d.lastName ?? '';
    const tutorName = tutorContact?.name ?? '';
    const name = tutorName.trim() || `${firstName} ${lastName}`.trim() || 'Sin nombre';
    matches.push({ id: doc.id, name });
  }
  return matches;
}
