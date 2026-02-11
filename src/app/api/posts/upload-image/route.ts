/**
 * POST /api/posts/upload-image
 * Sube imagen a Storage para posts. Path: schools/{schoolId}/posts/{postId}/{filename}
 * O schools/{schoolId}/posts/temp/{uuid}.{ext} si postId es "temp"
 */

import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/auth-server";
import { getAdminFirestore, getAdminStorage } from "@/lib/firebase-admin";

const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const schoolId = formData.get("schoolId") as string | null;
    const postId = formData.get("postId") as string | null;

    if (!file || !schoolId) {
      return NextResponse.json(
        { error: "Faltan file o schoolId" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `La imagen no debe superar ${MAX_SIZE_BYTES / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Solo se permiten imágenes JPEG, PNG, WebP o GIF" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${auth.uid}`).get();
    const schoolUserData = schoolUserSnap.data() as { role?: string } | undefined;
    const platformSnap = await db.doc(`platformUsers/${auth.uid}`).get();
    const platformData = platformSnap.data() as { super_admin?: boolean } | undefined;
    const isSuperAdmin = platformData?.super_admin === true;
    const isSchoolAdmin = schoolUserData?.role === "school_admin";
    const isEditor = schoolUserData?.role === "editor";
    const isCoach = schoolUserData?.role === "coach";

    if (!isSuperAdmin && !schoolUserSnap.exists) {
      return NextResponse.json({ error: "No pertenecés a esta escuela" }, { status: 403 });
    }
    if (!isSuperAdmin && !isSchoolAdmin && !isEditor && !isCoach) {
      return NextResponse.json(
        { error: "Solo admins, editores o entrenadores pueden subir imágenes" },
        { status: 403 }
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
    const filename = postId && postId !== "temp"
      ? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${safeExt}`
      : `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${safeExt}`;
    const storagePath = postId && postId !== "temp"
      ? `schools/${schoolId}/posts/${postId}/${filename}`
      : `schools/${schoolId}/posts/temp/${filename}`;

    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`;
    const bucket = getAdminStorage().bucket(bucketName);
    const blob = bucket.file(storagePath);
    const buffer = Buffer.from(await file.arrayBuffer());
    await blob.save(buffer, {
      metadata: { contentType: file.type },
      public: true,
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

    return NextResponse.json({ url, storagePath });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[posts/upload-image POST]", e);
    return NextResponse.json(
      { error: "Error al subir imagen", detail: message },
      { status: 500 }
    );
  }
}
