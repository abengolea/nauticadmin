/**
 * POST /api/players/status
 * Actualiza solo el status del jugador (active | inactive | suspended).
 * Solo administrador o entrenador de la escuela.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";

const VALID_STATUSES = ["active", "inactive", "suspended"] as const;

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { schoolId, playerId, status } = body as {
      schoolId?: string;
      playerId?: string;
      status?: string;
    };
    if (!schoolId || !playerId || !status) {
      return NextResponse.json(
        { error: "Faltan schoolId, playerId o status" },
        { status: 400 }
      );
    }
    if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return NextResponse.json(
        { error: "Status debe ser active, inactive o suspended" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const uid = auth.uid;

    const schoolUserSnap = await db
      .doc(`schools/${schoolId}/users/${uid}`)
      .get();
    const userInSchool =
      schoolUserSnap.exists &&
      ["school_admin", "coach"].includes(
        (schoolUserSnap.data() as { role?: string })?.role ?? ""
      );
    const platformUserSnap = await db.doc(`platformUsers/${uid}`).get();
    const isSuperAdmin =
      platformUserSnap.exists &&
      (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true;

    if (!userInSchool && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Solo el administrador o entrenador de la escuela puede cambiar el estado" },
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

    await playerRef.update({ status });

    return NextResponse.json({ ok: true, status });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[players/status POST]", e);
    return NextResponse.json(
      { error: "Error al actualizar el estado", detail: message },
      { status: 500 }
    );
  }
}
