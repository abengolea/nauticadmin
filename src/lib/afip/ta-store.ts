/**
 * Caché compartida del TA WSAA (local + App Hosting).
 * AFIP permite un solo TA vigente por certificado; /tmp en Cloud Run se pierde
 * en cada reinicio y no comparte el archivo de esta PC.
 */
import type { Firestore } from 'firebase-admin/firestore';

export const AFIP_TA_COLLECTION = 'afipWsaaTickets';

export interface SharedTa {
  token: string;
  sign: string;
  expirationTime: string;
}

export function sharedTaDocId(production: boolean): string {
  const suffix = production ? 'prod' : 'homo';
  const key = (process.env.AFIP_TA_CACHE_KEY ?? 'notificas').replace(/\W/g, '_') || 'notificas';
  return `${key}_${suffix}`;
}

export function isTaValid(ta: SharedTa, marginMs: number): boolean {
  if (!ta.token || !ta.sign || !ta.expirationTime) return false;
  const expiration = new Date(ta.expirationTime).getTime();
  return Number.isFinite(expiration) && expiration > Date.now() + marginMs;
}

async function getDb(): Promise<Firestore | null> {
  try {
    const { getAdminFirestore } = await import('../firebase-admin');
    return getAdminFirestore();
  } catch {
    return null;
  }
}

export async function loadSharedTa(
  production: boolean,
  marginMs: number
): Promise<SharedTa | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const snap = await db.collection(AFIP_TA_COLLECTION).doc(sharedTaDocId(production)).get();
    if (!snap.exists) return null;
    const data = snap.data() as SharedTa;
    if (!isTaValid(data, marginMs)) {
      console.log('[WSAA] TA en Firestore expirado o por vencer');
      return null;
    }
    console.log('[WSAA] Usando TA desde Firestore (válido hasta', data.expirationTime, ')');
    return {
      token: data.token,
      sign: data.sign,
      expirationTime: data.expirationTime,
    };
  } catch (err) {
    console.warn(
      '[WSAA] No se pudo leer TA de Firestore:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

export async function saveSharedTa(production: boolean, ta: SharedTa): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.collection(AFIP_TA_COLLECTION).doc(sharedTaDocId(production)).set({
      token: ta.token,
      sign: ta.sign,
      expirationTime: ta.expirationTime,
      updatedAt: new Date().toISOString(),
    });
    console.log('[WSAA] TA guardado en Firestore', sharedTaDocId(production));
  } catch (err) {
    console.warn(
      '[WSAA] No se pudo guardar TA en Firestore:',
      err instanceof Error ? err.message : err
    );
  }
}
