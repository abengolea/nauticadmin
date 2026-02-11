/**
 * Verificación de permisos para posts. Solo server-side.
 */

import { getAdminFirestore } from "@/lib/firebase-admin";

export type PostPermission = "create" | "edit" | "publish" | "unpublish" | "archive" | "view";

export async function canUserManagePosts(
  uid: string,
  schoolId: string,
  permission: PostPermission
): Promise<boolean> {
  const db = getAdminFirestore();

  const platformSnap = await db.doc(`platformUsers/${uid}`).get();
  const platformData = platformSnap.data() as { super_admin?: boolean } | undefined;
  if (platformData?.super_admin === true) return true;

  const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${uid}`).get();
  if (!schoolUserSnap.exists) return false;

  const role = (schoolUserSnap.data() as { role?: string })?.role ?? "";

  switch (permission) {
    case "view":
      return ["school_admin", "coach", "editor", "viewer"].includes(role);
    case "create":
    case "edit":
      return ["school_admin", "coach", "editor"].includes(role);
    case "publish":
    case "unpublish":
    case "archive":
      return role === "school_admin";
    default:
      return false;
  }
}

export interface AuthUser {
  uid: string;
  email?: string;
  displayName?: string;
}

export async function getSchoolsForUser(
  auth: AuthUser
): Promise<Array<{ schoolId: string; schoolName: string; schoolSlug: string }>> {
  const db = getAdminFirestore();

  const platformSnap = await db.doc(`platformUsers/${auth.uid}`).get();
  const platformData = platformSnap.data() as { super_admin?: boolean } | undefined;
  if (platformData?.super_admin === true) {
    const schoolsSnap = await db.collection("schools").get();
    return schoolsSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        schoolId: d.id,
        schoolName: String(data.name ?? ""),
        schoolSlug: String(data.slug ?? d.id),
      };
    });
  }

  const userEmail = auth.email?.trim().toLowerCase();
  if (!userEmail) return [];

  const rolesSnap = await db.collectionGroup("users").where("email", "==", userEmail).get();
  const userRolesDocs = rolesSnap.docs.filter((d) => d.id === auth.uid);

  const result: Array<{ schoolId: string; schoolName: string; schoolSlug: string }> = [];
  const seen = new Set<string>();
  for (const doc of userRolesDocs) {
    const schoolId = doc.ref.parent.parent?.id;
    if (!schoolId || seen.has(schoolId)) continue;
    seen.add(schoolId);
    const schoolSnap = await db.doc(`schools/${schoolId}`).get();
    if (!schoolSnap.exists) continue;
    const data = schoolSnap.data() as Record<string, unknown>;
    result.push({
      schoolId,
      schoolName: String(data.name ?? ""),
      schoolSlug: String(data.slug ?? schoolId),
    });
  }

  return result;
}
