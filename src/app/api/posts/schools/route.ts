/**
 * GET /api/posts/schools - Lista escuelas para el usuario (para selector en panel notas)
 */

import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/auth-server";
import { getSchoolsForUser } from "@/lib/posts/permissions";

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const schools = await getSchoolsForUser({
      uid: auth.uid,
      email: auth.email,
      displayName: auth.displayName,
    });

    return NextResponse.json({ schools });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[posts/schools GET]", e);
    return NextResponse.json(
      { error: "Error al listar escuelas", detail: message },
      { status: 500 }
    );
  }
}
