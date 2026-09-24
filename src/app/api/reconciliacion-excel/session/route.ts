/**
 * GET/POST /api/reconciliacion-excel/session
 * Persiste y recupera sesiones de conciliación Visa (imputación parcial + reanudar).
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";
import {
  getRecExcelSession,
  listInProgressSessions,
  saveRecExcelSession,
  updateSessionStatus,
} from "@/lib/reconciliacion-excel/session-db";
import type { RecExcelSession } from "@/lib/reconciliacion-excel/session-types";

export const dynamic = "force-dynamic";

async function checkAuth(request: Request, schoolId: string | null) {
  const auth = await verifyIdToken(request.headers.get("Authorization"));
  if (!auth) return { error: "No autorizado", status: 401 as const };
  if (!schoolId) return { error: "Falta schoolId", status: 400 as const };

  const db = getAdminFirestore();
  const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${auth.uid}`).get();
  const platformUserSnap = await db.doc(`platformUsers/${auth.uid}`).get();
  const isAdmin =
    (schoolUserSnap.exists &&
      (schoolUserSnap.data() as { role?: string })?.role === "school_admin") ||
    (platformUserSnap.exists &&
      (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true);

  if (!isAdmin) return { error: "Sin permiso", status: 403 as const };
  return { auth, db };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const period = searchParams.get("period");
    const check = await checkAuth(request, schoolId);
    if ("error" in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    const { db } = check;

    if (period) {
      const session = await getRecExcelSession(db, schoolId!, period);
      return NextResponse.json({ ok: true, session });
    }

    const sessions = await listInProgressSessions(db, schoolId!);
    return NextResponse.json({ ok: true, sessions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/session GET]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const check = await checkAuth(request, schoolId);
    if ("error" in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    const { auth, db } = check;

    const body = await request.json();
    const session = body?.session as RecExcelSession | undefined;
    if (!session?.period || !/^\d{4}-\d{2}$/.test(session.period)) {
      return NextResponse.json({ error: "Sesión inválida" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const toSave: RecExcelSession = {
      ...session,
      updatedAt: now,
      updatedBy: auth.uid,
      status:
        session.pendingAssignCount <= 0 && session.imputedCount >= session.totalConciliated
          ? "completed"
          : session.status === "completed"
            ? "completed"
            : "in_progress",
    };

    await saveRecExcelSession(db, schoolId!, toSave);
    return NextResponse.json({ ok: true, session: toSave });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/session POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const check = await checkAuth(request, schoolId);
    if ("error" in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    const { auth, db } = check;

    const body = await request.json();
    const period = String(body?.period ?? "").trim();
    const status = body?.status as "completed" | "in_progress" | undefined;
    if (!period || !status) {
      return NextResponse.json({ error: "Faltan period o status" }, { status: 400 });
    }

    await updateSessionStatus(db, schoolId!, period, status, auth.uid);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/session PATCH]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
