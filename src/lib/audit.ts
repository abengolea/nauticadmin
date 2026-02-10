import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

export type AuditAction =
  | "school.create"
  | "school.update"
  | "school.status_change"
  | "platform_user.promote_super_admin"
  | "platform_user.demote_super_admin"
  | "platform_config.update"
  | "physical_assessment_template.accept_field";

export interface AuditPayload {
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  schoolId?: string;
  details?: string;
}

/**
 * Escribe una entrada en el log de auditoría. Solo debe llamarse cuando el usuario es super admin.
 */
export async function writeAuditLog(
  firestore: Firestore,
  userEmail: string,
  userId: string,
  payload: AuditPayload
): Promise<void> {
  await addDoc(collection(firestore, "auditLog"), {
    userId,
    userEmail,
    action: payload.action,
    resourceType: payload.resourceType,
    resourceId: payload.resourceId ?? null,
    schoolId: payload.schoolId ?? null,
    details: payload.details ?? null,
    createdAt: serverTimestamp(),
  });
}
