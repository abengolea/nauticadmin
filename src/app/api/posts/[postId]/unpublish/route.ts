/**
 * POST /api/posts/[postId]/unpublish
 */

import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/auth-server";
import { unpublishPost, getPostById } from "@/lib/posts/server";
import { canUserManagePosts } from "@/lib/posts/permissions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { postId } = await params;
    const post = await getPostById(postId);
    if (!post) {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }

    const can = await canUserManagePosts(auth.uid, post.schoolId, "unpublish");
    if (!can) {
      return NextResponse.json({ error: "Solo admins pueden despublicar" }, { status: 403 });
    }

    const displayName = auth.displayName ?? auth.email ?? "Usuario";
    await unpublishPost(postId, auth.uid, displayName);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[posts/unpublish POST]", e);
    return NextResponse.json(
      { error: "Error al despublicar", detail: message },
      { status: 500 }
    );
  }
}
