/**
 * POST /api/reconciliacion-excel/save-player-alias
 * Guarda alias listado/pagador → cliente NauticAdmin para futuras imputaciones.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";
import { savePlayerAliases } from "@/lib/reconciliacion-excel/save-player-alias";

export const dynamic = "force-dynamic";

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

    const body = await request.json();
    const playerId = String(body?.playerId ?? "").trim();
    const aliasNames = (Array.isArray(body?.aliasNames) ? body.aliasNames : []) as string[];
    if (!playerId) {
      return NextResponse.json({ error: "Falta playerId" }, { status: 400 });
    }
    if (aliasNames.length === 0) {
      return NextResponse.json({ error: "Faltan aliasNames" }, { status: 400 });
    }

    const saved = await savePlayerAliases(db, {
      schoolId,
      playerId,
      aliasNames,
      uid: auth.uid,
    });

    return NextResponse.json({ ok: true, saved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/save-player-alias]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
