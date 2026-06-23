/**
 * POST /api/reconciliacion-excel/save-rule
 * Guarda una regla manual (Pagador->Cuenta preferida) para desempatar o crear relación.
 * Escribe en payerMappings (colección unificada).
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";
import { normalizePayer } from "@/lib/reconciliacion-excel/normalize";
import { PAYER_MAPPINGS_COLLECTION } from "@/lib/reconciliation/payer-mappings";

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
    const { auth, db } = check;

    const body = await request.json();
    const payerRaw = body?.payerRaw as string | undefined;
    const accountKey = body?.accountKey as string | undefined;
    const accountRaw = body?.accountRaw as string | undefined;

    if (!payerRaw?.trim() || !accountKey?.trim()) {
      return NextResponse.json(
        { error: "Faltan payerRaw o accountKey" },
        { status: 400 }
      );
    }

    const payerKey = normalizePayer(payerRaw);
    const now = new Date().toISOString();

    const docId = `${payerKey}_account_${accountKey}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 150);
    const col = db.collection("schools").doc(schoolId!).collection(PAYER_MAPPINGS_COLLECTION);

    await col.doc(docId).set({
      payerKey,
      payerRaw: payerRaw.trim(),
      targetType: "account",
      targetId: accountKey,
      targetRaw: (accountRaw ?? accountKey).trim(),
      source: "manual",
      createdAt: now,
      createdBy: auth.uid,
    });

    return NextResponse.json({
      ok: true,
      message: "Regla guardada correctamente",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/save-rule POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
