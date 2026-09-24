import type admin from "firebase-admin";
import type { RecExcelSession, RecExcelSessionStatus } from "./session-types";

export const REC_EXCEL_SESSIONS = "recExcelSessions";

export function sessionDocId(period: string): string {
  return period.replace(/[^0-9-]/g, "") || "unknown";
}

export async function getRecExcelSession(
  db: admin.firestore.Firestore,
  schoolId: string,
  period: string
): Promise<RecExcelSession | null> {
  const snap = await db
    .collection("schools")
    .doc(schoolId)
    .collection(REC_EXCEL_SESSIONS)
    .doc(sessionDocId(period))
    .get();
  if (!snap.exists) return null;
  return snap.data() as RecExcelSession;
}

export async function listInProgressSessions(
  db: admin.firestore.Firestore,
  schoolId: string
): Promise<RecExcelSession[]> {
  const snap = await db
    .collection("schools")
    .doc(schoolId)
    .collection(REC_EXCEL_SESSIONS)
    .where("status", "==", "in_progress")
    .get();
  return snap.docs
    .map((d) => d.data() as RecExcelSession)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveRecExcelSession(
  db: admin.firestore.Firestore,
  schoolId: string,
  session: RecExcelSession
): Promise<void> {
  await db
    .collection("schools")
    .doc(schoolId)
    .collection(REC_EXCEL_SESSIONS)
    .doc(sessionDocId(session.period))
    .set(session);
}

export async function updateSessionStatus(
  db: admin.firestore.Firestore,
  schoolId: string,
  period: string,
  status: RecExcelSessionStatus,
  uid: string
): Promise<void> {
  const ref = db
    .collection("schools")
    .doc(schoolId)
    .collection(REC_EXCEL_SESSIONS)
    .doc(sessionDocId(period));
  await ref.set(
    {
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    },
    { merge: true }
  );
}
