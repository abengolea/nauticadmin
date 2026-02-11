/**
 * GET /api/posts/[postId] - Obtiene post (para edición)
 * PATCH /api/posts/[postId] - Actualiza post
 */

import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/auth-server";
import { updatePost, getPostById } from "@/lib/posts/server";
import { canUserManagePosts } from "@/lib/posts/permissions";
import type { UpdatePostInput } from "@/lib/types/posts";

export async function GET(
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

    const can = await canUserManagePosts(auth.uid, post.schoolId, "view");
    if (!can) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    return NextResponse.json(post);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[posts GET]", e);
    return NextResponse.json(
      { error: "Error al obtener nota", detail: message },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    const can = await canUserManagePosts(auth.uid, post.schoolId, "edit");
    if (!can) {
      return NextResponse.json({ error: "Sin permiso para editar" }, { status: 403 });
    }

    const body = (await request.json()) as UpdatePostInput;
    const displayName = auth.displayName ?? auth.email ?? "Usuario";
    await updatePost(postId, body, auth.uid, displayName);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[posts PATCH]", e);
    return NextResponse.json(
      { error: "Error al actualizar nota", detail: message },
      { status: 500 }
    );
  }
}
