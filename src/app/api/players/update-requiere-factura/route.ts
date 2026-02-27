/**
 * POST /api/players/update-requiere-factura
 * Actualiza requiereFactura en lote para varios jugadores.
 * Solo staff de la escuela (admin/coach).
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const schoolId = body?.schoolId as string | undefined;
    const playerIds = body?.playerIds as string[] | undefined;
    const requiereFactura = body?.requiereFactura as boolean | undefined;

    if (!schoolId || !Array.isArray(playerIds) || playerIds.length === 0) {
      return NextResponse.json(
        { error: "Faltan schoolId o playerIds (array no vacío)" },
        { status: 400 }
      );
    }

    if (typeof requiereFactura !== "boolean") {
      return NextResponse.json(
        { error: "requiereFactura debe ser true o false" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();

    const schoolUserSnap = await db
      .collection("schools")
      .doc(schoolId)
      .collection("users")
      .doc(auth.uid)
      .get();

    if (!schoolUserSnap.exists) {
      return NextResponse.json(
        { error: "No tenés permiso en esta náutica" },
        { status: 403 }
      );
    }

    const role = (schoolUserSnap.data() as { role?: string })?.role;
    if (role !== "school_admin" && role !== "operador") {
      return NextResponse.json(
        { error: "Solo el administrador o entrenador puede modificar facturación" },
        { status: 403 }
      );
    }

    let updated = 0;
    for (const playerId of playerIds) {
      const playerRef = db.doc(`schools/${schoolId}/players/${playerId}`);
      const snap = await playerRef.get();
      if (snap.exists) {
        await playerRef.update({ requiereFactura });
        updated++;
      }
    }

    return NextResponse.json({
      ok: true,
      message: requiereFactura
        ? `Se marcó facturación para ${updated} cliente${updated !== 1 ? "s" : ""}.`
        : `Se marcó como no facturar para ${updated} cliente${updated !== 1 ? "s" : ""}.`,
      updated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[players/update-requiere-factura POST]", e);
    return NextResponse.json(
      { error: "Error al actualizar", detail: message },
      { status: 500 }
    );
  }
}
