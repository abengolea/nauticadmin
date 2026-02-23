/**
 * POST /api/reconciliacion-excel/audit
 * Guarda log de auditoría de conciliación.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";
import type { AuditLogEntry } from "@/lib/reconciliacion-excel/types";

const COLLECTION = "recExcelAudit";

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

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const check = await checkAuth(request, schoolId);
    if ("error" in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    const { db } = check;

    const body = await request.json();
    const entries = body?.entries as AuditLogEntry[] | undefined;
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ ok: true, saved: 0 });
    }

    const col = db.collection("schools").doc(schoolId!).collection(COLLECTION);
    const batch = db.batch();

    for (const e of entries) {
      const ref = col.doc();
      batch.set(ref, {
        ...e,
        timestamp: e.timestamp || new Date().toISOString(),
      });
    }

    await batch.commit();

    return NextResponse.json({ ok: true, saved: entries.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/audit POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
