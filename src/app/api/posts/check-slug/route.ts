/**
 * GET /api/posts/check-slug?schoolId=&slug=&excludePostId=
 */

import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/auth-server";
import { checkSlugUnique } from "@/lib/posts/server";
import { canUserManagePosts } from "@/lib/posts/permissions";

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const slug = searchParams.get("slug");
    const excludePostId = searchParams.get("excludePostId") ?? undefined;

    if (!schoolId || !slug) {
      return NextResponse.json({ error: "Faltan schoolId o slug" }, { status: 400 });
    }

    const can = await canUserManagePosts(auth.uid, schoolId, "create");
    if (!can) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    const unique = await checkSlugUnique(schoolId, slug.trim(), excludePostId);
    return NextResponse.json({ unique });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[posts/check-slug GET]", e);
    return NextResponse.json(
      { error: "Error al verificar slug", detail: message },
      { status: 500 }
    );
  }
}
