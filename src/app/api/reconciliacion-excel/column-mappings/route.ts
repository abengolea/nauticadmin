/**
 * GET/PUT /api/reconciliacion-excel/column-mappings
 * Perfiles de mapeo con nombre (Visa Crédito, Visa Débito, etc.).
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";
import {
  mappingProfileId,
  normalizeColumnMapping,
  normalizeMappingProfile,
} from "@/lib/reconciliacion-excel/column-mapping";
import type { PaymentFileKind } from "@/lib/reconciliacion-excel/types";

const COLLECTION = "recExcelColumnMappings";
const KINDS: PaymentFileKind[] = ["credit", "debit"];

async function checkAuth(request: Request, schoolId: string | null) {
  const auth = await verifyIdToken(request.headers.get("Authorization"));
  if (!auth) return { error: "No autorizado", status: 401 as const };
  if (!schoolId) return { error: "Falta schoolId", status: 400 as const };

  const db = getAdminFirestore();
  const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${auth.uid}`).get();
  const platformUserSnap = await db.doc(`platformUsers/${auth.uid}`).get();
  const isAdmin =
    (schoolUserSnap.exists && (schoolUserSnap.data() as { role?: string })?.role === "school_admin") ||
    (platformUserSnap.exists && (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true);

  if (!isAdmin) return { error: "Sin permiso", status: 403 as const };
  return { auth, db };
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const check = await checkAuth(request, schoolId);
    if ("error" in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    const { db } = check;

    const snap = await db
      .collection("schools")
      .doc(schoolId!)
      .collection(COLLECTION)
      .get();

    const profiles = snap.docs
      .map((doc) => normalizeMappingProfile(doc.id, { id: doc.id, ...doc.data() }))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    return NextResponse.json({ profiles });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/column-mappings GET]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const check = await checkAuth(request, schoolId);
    if ("error" in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    const { auth, db } = check;

    const body = await request.json();
    const name = String(body?.name ?? "").trim().slice(0, 80);
    const kind = body?.kind as PaymentFileKind | undefined;
    const saveAsNew = Boolean(body?.saveAsNew);
    const mapping = normalizeColumnMapping(body?.mapping);
    const headers = Array.isArray(body?.headers)
      ? body.headers.map((h: unknown) => String(h ?? "").trim()).filter(Boolean).slice(0, 40)
      : [];

    if (!name) {
      return NextResponse.json({ error: "Falta el nombre del mapeo" }, { status: 400 });
    }
    if (!kind || !KINDS.includes(kind)) {
      return NextResponse.json({ error: "kind debe ser credit o debit" }, { status: 400 });
    }
    if (!mapping) {
      return NextResponse.json({ error: "Mapeo inválido" }, { status: 400 });
    }

    const col = db.collection("schools").doc(schoolId!).collection(COLLECTION);
    let id = String(body?.id ?? "").trim();

    if (!id || saveAsNew) {
      id = mappingProfileId(name);
      const existing = await col.doc(id).get();
      if (existing.exists && saveAsNew) {
        id = `${id}_${Date.now().toString(36)}`;
      }
    }

    const now = new Date().toISOString();
    const payload = {
      name,
      kind,
      mapping,
      headers,
      updatedAt: now,
      updatedBy: auth.uid,
    };
    await col.doc(id).set(payload);

    return NextResponse.json({
      ok: true,
      profile: { id, ...payload },
      message: "Mapeo guardado",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/column-mappings PUT]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
