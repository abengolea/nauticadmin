/**
 * GET/POST /api/reconciliation/payer-mappings
 * Colección unificada: Pagador → Cuenta/Cliente (fusiona recExcelRelations + recPayerAliases).
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";
import {
  PAYER_MAPPINGS_COLLECTION,
  mappingsToRelations,
  type PayerMapping,
  type PayerMappingSource,
} from "@/lib/reconciliation/payer-mappings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const targetType = searchParams.get("targetType") as "account" | "player" | null;
    const source = searchParams.get("source") as PayerMappingSource | null;

    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!schoolId) return NextResponse.json({ error: "Falta schoolId" }, { status: 400 });

    const db = getAdminFirestore();
    const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${auth.uid}`).get();
    const platformUserSnap = await db.doc(`platformUsers/${auth.uid}`).get();
    const isAdmin =
      (schoolUserSnap.exists && (schoolUserSnap.data() as { role?: string })?.role === "school_admin") ||
      (platformUserSnap.exists && (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true);
    if (!isAdmin) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

    let q = db
      .collection("schools")
      .doc(schoolId)
      .collection(PAYER_MAPPINGS_COLLECTION)
      .limit(5000);

    if (targetType) q = q.where("targetType", "==", targetType);
    if (source) q = q.where("source", "==", source);

    const snap = await q.get();

    const mappings: PayerMapping[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        payerKey: data.payerKey ?? "",
        payerRaw: data.payerRaw ?? "",
        targetType: (data.targetType ?? "account") as "account" | "player",
        targetId: data.targetId ?? "",
        targetRaw: data.targetRaw ?? "",
        source: (data.source ?? "excel") as PayerMappingSource,
        createdAt: data.createdAt ?? "",
        createdBy: data.createdBy,
      };
    });

    const relations = mappingsToRelations(mappings);

    return NextResponse.json({
      mappings,
      relations,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliation/payer-mappings GET]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

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
      (schoolUserSnap.exists && (schoolUserSnap.data() as { role?: string })?.role === "school_admin") ||
      (platformUserSnap.exists && (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true);
    if (!isAdmin) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

    const body = await request.json();
    const items = body?.mappings as PayerMapping[] | undefined;
    const relations = body?.relations as Array<{
      accountKey: string;
      payerKey: string;
      payerRaw: string;
      accountRaw: string;
      createdAt?: string;
    }> | undefined;

    const toSave: PayerMapping[] = [];

    if (Array.isArray(items) && items.length > 0) {
      toSave.push(...items);
    } else if (Array.isArray(relations) && relations.length > 0) {
      const now = new Date().toISOString();
      for (const r of relations) {
        toSave.push({
          payerKey: r.payerKey,
          payerRaw: r.payerRaw,
          targetType: "account",
          targetId: r.accountKey,
          targetRaw: r.accountRaw ?? r.accountKey,
          source: "excel",
          createdAt: r.createdAt ?? now,
          createdBy: auth.uid,
        });
      }
    }

    if (toSave.length === 0) {
      return NextResponse.json(
        { error: "Se requiere mappings o relations (array no vacío)" },
        { status: 400 }
      );
    }

    const col = db.collection("schools").doc(schoolId).collection(PAYER_MAPPINGS_COLLECTION);
    const batch = db.batch();

    for (const m of toSave) {
      const docId = `${m.payerKey}_${m.targetType}_${m.targetId}`
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .slice(0, 150);
      batch.set(col.doc(docId), {
        ...m,
        createdBy: m.createdBy ?? auth.uid,
      });
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      saved: toSave.length,
      message: `Se guardaron ${toSave.length} mapeos`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliation/payer-mappings POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
