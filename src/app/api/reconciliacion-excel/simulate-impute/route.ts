/**
 * POST /api/reconciliacion-excel/simulate-impute
 * Simula la imputación sin escribir en Firestore.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";
import type { ImputePaymentItem } from "@/lib/reconciliacion-excel/types";
import { runImputePlan } from "@/lib/reconciliacion-excel/impute-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    const items = (body?.items ?? []) as ImputePaymentItem[];
    const period = String(body?.period ?? "").trim();
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No hay pagos para simular" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json(
        { error: "Falta el período a imputar (YYYY-MM, ej. 2026-09)" },
        { status: 400 }
      );
    }

    const approvedFuzzy = new Set(
      (Array.isArray(body?.approvedFuzzy) ? body.approvedFuzzy : []) as string[]
    );

    const result = await runImputePlan(db, {
      schoolId,
      items,
      period,
      simulate: true,
      approvedFuzzyIds: approvedFuzzy,
    });

    return NextResponse.json({ ok: true, simulate: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/simulate-impute]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
