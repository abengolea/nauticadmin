/**
 * GET/POST /api/reconciliacion-excel/relations
 * Lista o guarda relaciones Cuenta->Pagador.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";
import type { RelationRow } from "@/lib/reconciliacion-excel/types";

const COLLECTION = "recExcelRelations";

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
      .limit(5000)
      .get();

    const relations: RelationRow[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        accountKey: data.accountKey ?? "",
        payerKey: data.payerKey ?? "",
        payerRaw: data.payerRaw ?? "",
        accountRaw: data.accountRaw ?? "",
        createdAt: data.createdAt ?? "",
      };
    });

    return NextResponse.json({ relations });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/relations GET]", e);
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
    const { db } = check;

    const body = await request.json();
    const relations = body?.relations as RelationRow[] | undefined;
    if (!Array.isArray(relations) || relations.length === 0) {
      return NextResponse.json(
        { error: "Se requiere un array de relaciones no vacío" },
        { status: 400 }
      );
    }

    const batch = db.batch();
    const col = db.collection("schools").doc(schoolId!).collection(COLLECTION);

    for (const r of relations) {
      const docId = `${r.payerKey}_${r.accountKey}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 150);
      const ref = col.doc(docId);
      batch.set(ref, {
        accountKey: r.accountKey,
        payerKey: r.payerKey,
        payerRaw: r.payerRaw,
        accountRaw: r.accountRaw,
        createdAt: r.createdAt,
      });
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      saved: relations.length,
      message: `Se guardaron ${relations.length} relaciones`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/relations POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
