/**
 * Verificación de autenticación en el servidor (API routes, server actions).
 * SOLO para uso server-side.
 */

import { getAdminAuth } from './firebase-admin';

/** Decodifica el token Bearer y retorna el uid o null */
export async function verifyIdToken(authHeader: string | null): Promise<{ uid: string; email?: string; displayName?: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const name = decoded.name ?? (decoded as { displayName?: string }).displayName;
    return { uid: decoded.uid, email: decoded.email, displayName: name };
  } catch {
    return null;
  }
}

/**
 * Verifica que el usuario sea admin de la escuela (school_admin) o super admin.
 * Consulta schools/{schoolId}/users/{uid} y platformUsers/{uid}.
 */
export async function isSchoolAdminOrSuperAdmin(uid: string, schoolId: string): Promise<boolean> {
  const { getAdminFirestore } = await import('./firebase-admin');
  const db = getAdminFirestore();

  const [platformSnap, schoolUserSnap] = await Promise.all([
    db.collection('platformUsers').doc(uid).get(),
    db.doc(`schools/${schoolId}/users/${uid}`).get(),
  ]);

  const platformData = platformSnap.data() as { super_admin?: boolean } | undefined;
  if (platformData?.super_admin === true) return true;

  const schoolUserData = schoolUserSnap.data() as { role?: string } | undefined;
  return schoolUserData?.role === 'school_admin';
}

/**
 * Verifica que el usuario sea super admin (platformUsers/{uid}.super_admin === true).
 */
export async function verifySuperAdmin(authHeader: string | null): Promise<{ uid: string; email?: string } | null> {
  const auth = await verifyIdToken(authHeader);
  if (!auth) return null;

  // Fallback: email hardcodeado para super admin (útil si platformUsers no existe aún)
  const isHardcodedSuperAdmin = auth.email === 'abengolea1@gmail.com';

  try {
    const { getAdminFirestore } = await import('./firebase-admin');
    const db = getAdminFirestore();
    const platformSnap = await db.collection('platformUsers').doc(auth.uid).get();
    const data = platformSnap.data() as { super_admin?: boolean } | undefined;
    const isSuperAdmin = data?.super_admin === true || isHardcodedSuperAdmin;

    if (!isSuperAdmin) return null;
    return auth;
  } catch (e: unknown) {
    const err = e as { code?: number; message?: string };
    // Error 5 NOT_FOUND: Firestore no habilitado o base de datos no existe
    if (err?.code === 5 || err?.message?.includes('NOT_FOUND')) {
      if (isHardcodedSuperAdmin) {
        return auth; // Permitir al super admin hardcodeado aunque falle Firestore
      }
      console.error(
        '[auth-server] Firestore NOT_FOUND. Verificá que Firestore esté habilitado en Firebase Console y que exista la base de datos (default).'
      );
      throw new Error(
        'Firestore no está configurado correctamente. Habilitá Firestore en Firebase Console → Firestore Database.'
      );
    }
    throw e;
  }
}
