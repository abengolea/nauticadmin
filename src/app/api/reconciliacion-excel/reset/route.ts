/**
 * POST /api/reconciliacion-excel/reset
 * Borra imputaciones de conciliación Visa y el log de auditoría para volver a empezar.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const AUDIT_COLLECTION = "recExcelAudit";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!schoolId) return NextResponse.json({ error: "Falta schoolId" }, { status: 400 });

    const db = getAdminFirestore();
    const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${auth.uid}`).get();
    const platformUserSnap = await db.doc(`platformUsers/${auth.uid}`).get();
    const isAdmin =
      (schoolUserSnap.exists &&
        (schoolUserSnap.data() as { role?: string })?.role === "school_admin") ||
      (platformUserSnap.exists &&
        (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true);
    if (!isAdmin) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

    const paymentsSnap = await db.collection("payments").where("schoolId", "==", schoolId).get();
    let paymentsDeleted = 0;
    let accountEntriesDeleted = 0;

    for (const doc of paymentsSnap.docs) {
      const data = doc.data() as {
        playerId?: string;
        metadata?: { source?: string };
      };
      if (data.metadata?.source !== "visa_excel_reconciliation") continue;

      const playerId = data.playerId;
      if (playerId) {
        const payEntry = db
          .collection("schools")
          .doc(schoolId)
          .collection("clientAccounts")
          .doc(playerId)
          .collection("entries")
          .doc(`pay-${doc.id}`);
        const paySnap = await payEntry.get();
        if (paySnap.exists) {
          await payEntry.delete();
          accountEntriesDeleted++;
        }
      }

      await doc.ref.delete();
      paymentsDeleted++;
    }

    const auditCol = db.collection("schools").doc(schoolId).collection(AUDIT_COLLECTION);
    const auditSnap = await auditCol.get();
    let auditDeleted = 0;
    if (!auditSnap.empty) {
      const batch = db.batch();
      for (const doc of auditSnap.docs) {
        batch.delete(doc.ref);
        auditDeleted++;
      }
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      paymentsDeleted,
      accountEntriesDeleted,
      auditDeleted,
      message:
        paymentsDeleted > 0
          ? `Se borraron ${paymentsDeleted} pagos imputados por conciliación Visa. Podés cargar los Excel de nuevo.`
          : "No había pagos imputados. Se limpió el registro de auditoría. Podés cargar los Excel de nuevo.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/reset]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
