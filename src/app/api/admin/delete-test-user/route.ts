/**
 * POST /api/admin/delete-test-user
 * Borra un usuario de prueba: Firebase Auth + todas las referencias en Firestore.
 * Solo super admin. Uso: limpiar usuarios de prueba para volver a probar flujos de registro.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth?.uid) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const db = getAdminFirestore();
    const adminAuth = getAdminAuth();

    const platformUserSnap = await db.doc(`platformUsers/${auth.uid}`).get();
    const platformData = platformUserSnap.data() as { super_admin?: boolean; email?: string } | undefined;
    const isSuperAdmin =
      platformData?.super_admin === true || auth.email === "abengolea1@gmail.com";

    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Solo el super administrador puede borrar usuarios de prueba" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { uid: targetUid } = body as { uid?: string };
    if (!targetUid || typeof targetUid !== "string") {
      return NextResponse.json(
        { error: "Falta uid del usuario a borrar" },
        { status: 400 }
      );
    }

    if (targetUid === auth.uid) {
      return NextResponse.json(
        { error: "No puedes borrarte a ti mismo" },
        { status: 400 }
      );
    }

    let targetEmail: string | null = (body as { email?: string }).email ?? null;
    if (!targetEmail) {
      try {
        const userRecord = await adminAuth.getUser(targetUid);
        targetEmail = userRecord.email ?? null;
      } catch {
        // Usuario puede no existir en Auth; seguimos con Firestore
      }
    }
    const emailLower = targetEmail?.toLowerCase().trim() || null;

    const batch = db.batch();

    // platformUsers/{uid}
    const platformUserRef = db.doc(`platformUsers/${targetUid}`);
    batch.delete(platformUserRef);

    // schools/{schoolId}/users/{uid} vía collectionGroup
    const usersGroup = db.collectionGroup("users");
    const usersSnap = await usersGroup.get();
    usersSnap.docs.forEach((d) => {
      if (d.id === targetUid) batch.delete(d.ref);
    });

    // accessRequests donde uid === targetUid
    const accessRequestsSnap = await db.collection("accessRequests").where("uid", "==", targetUid).get();
    accessRequestsSnap.docs.forEach((d) => batch.delete(d.ref));

    if (emailLower) {
      const pendingByEmailRef = db.doc(`pendingPlayerByEmail/${emailLower}`);
      batch.delete(pendingByEmailRef);

      const attemptsSnap = await db.collection("emailVerificationAttempts").where("email", "==", targetEmail).get();
      attemptsSnap.docs.forEach((d) => batch.delete(d.ref));

      const playerLoginRef = db.doc(`playerLogins/${emailLower}`);
      batch.delete(playerLoginRef);
    }

    await batch.commit();

    // Borrar usuario de Firebase Auth (al final para tener email si hacía falta)
    try {
      await adminAuth.deleteUser(targetUid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("USER_NOT_FOUND")) {
        console.error("[delete-test-user] Auth deleteUser failed:", err);
        return NextResponse.json(
          { error: "Referencias borradas pero falló borrar en Auth", detail: msg },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, uid: targetUid });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin/delete-test-user POST]", e);
    return NextResponse.json(
      { error: "Error al borrar usuario de prueba", detail: message },
      { status: 500 }
    );
  }
}
