/**
 * GET /api/posts - Lista posts (público para published, autenticado para admin)
 * POST /api/posts - Crea post (borrador). Requiere auth.
 */

import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/auth-server";
import { listPosts, createPost } from "@/lib/posts/server";
import { canUserManagePosts, getSchoolsForUser } from "@/lib/posts/permissions";
import type { CreatePostInput } from "@/lib/types/posts";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId") ?? undefined;
    const schoolSlug = searchParams.get("schoolSlug") ?? undefined;
    const status = (searchParams.get("status") ?? "published") as "draft" | "published" | "archived";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "12", 10) || 12, 50);
    const cursor = searchParams.get("cursor") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    const auth = await verifyIdToken(request.headers.get("Authorization"));

    if (status !== "published" && !auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let effectiveSchoolId = schoolId;
    if (status !== "published" && auth) {
      const schools = await getSchoolsForUser(auth);
      if (schools.length === 0) {
        return NextResponse.json({ error: "Sin escuelas asignadas" }, { status: 403 });
      }
      if (schoolId) {
        const can = await canUserManagePosts(auth.uid, schoolId, "view");
        if (!can) {
          return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
        }
      } else {
        effectiveSchoolId = schools[0].schoolId;
      }
    }

    const result = await listPosts({
      schoolId: effectiveSchoolId,
      schoolSlug,
      status,
      limit,
      cursor,
      search,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[posts GET]", e);
    return NextResponse.json(
      { error: "Error al listar notas", detail: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = (await request.json()) as CreatePostInput;
    const { schoolId, schoolSlug, schoolName, title, slug, excerpt, content, coverImageUrl, galleryUrls, tags } = body;

    if (!schoolId || !schoolSlug || !schoolName || !title) {
      return NextResponse.json(
        { error: "Faltan schoolId, schoolSlug, schoolName o title" },
        { status: 400 }
      );
    }

    const can = await canUserManagePosts(auth.uid, schoolId, "create");
    if (!can) {
      return NextResponse.json({ error: "Sin permiso para crear notas" }, { status: 403 });
    }

    const displayName = auth.displayName ?? auth.email ?? "Usuario";
    const postId = await createPost(
      {
        schoolId,
        schoolSlug,
        schoolName,
        title,
        slug: slug ?? "",
        excerpt: excerpt ?? "",
        content: content ?? "",
        coverImageUrl,
        galleryUrls,
        tags,
      },
      auth.uid,
      displayName
    );

    return NextResponse.json({ id: postId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[posts POST]", e);
    return NextResponse.json(
      { error: "Error al crear nota", detail: message },
      { status: 500 }
    );
  }
}
