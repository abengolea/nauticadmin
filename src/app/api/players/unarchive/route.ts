/**
 * POST /api/players/unarchive
 * Desarchiva un jugador (vuelve a aparecer en listados y suma en totales).
 * Solo administrador de la escuela o super admin.
 */

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { schoolId, playerId } = body as { schoolId?: string; playerId?: string };
    if (!schoolId || !playerId) {
      return NextResponse.json(
        { error: "Faltan schoolId o playerId" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const uid = auth.uid;

    const schoolUserSnap = await db
      .doc(`schools/${schoolId}/users/${uid}`)
      .get();
    const platformUserSnap = await db.doc(`platformUsers/${uid}`).get();
    const isSchoolAdmin =
      schoolUserSnap.exists &&
      (schoolUserSnap.data() as { role?: string })?.role === "school_admin";
    const isSuperAdmin =
      platformUserSnap.exists &&
      (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true;

    if (!isSchoolAdmin && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Solo el administrador de la escuela puede desarchivar jugadores" },
        { status: 403 }
      );
    }

    const playerRef = db.doc(`schools/${schoolId}/players/${playerId}`);
    const playerSnap = await playerRef.get();
    if (!playerSnap.exists) {
      return NextResponse.json(
        { error: "Jugador no encontrado en esta escuela" },
        { status: 404 }
      );
    }

    await playerRef.update({
      archived: false,
      archivedAt: FieldValue.delete(),
      archivedBy: FieldValue.delete(),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[players/unarchive POST]", e);
    return NextResponse.json(
      { error: "Error al desarchivar el jugador", detail: message },
      { status: 500 }
    );
  }
}
