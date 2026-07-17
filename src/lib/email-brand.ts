/**
 * Helpers de branding de email por náutica (servidor).
 */

import type { Firestore } from "firebase-admin/firestore";

export type SchoolEmailBrand = {
  brandName: string;
  logoUrl?: string;
};

const DEFAULT_BRAND = "NauticAdmin";

/**
 * Lee nombre y logo de la náutica para plantillas de correo.
 */
export async function getSchoolEmailBrand(
  db: Firestore,
  schoolId: string | null | undefined
): Promise<SchoolEmailBrand> {
  if (!schoolId) return { brandName: DEFAULT_BRAND };
  try {
    const snap = await db.doc(`schools/${schoolId}`).get();
    if (!snap.exists) return { brandName: DEFAULT_BRAND };
    const data = snap.data() as { name?: string; logoUrl?: string } | undefined;
    const brandName = data?.name?.trim() || DEFAULT_BRAND;
    const logoUrl = data?.logoUrl?.trim() || undefined;
    return { brandName, logoUrl };
  } catch {
    return { brandName: DEFAULT_BRAND };
  }
}
