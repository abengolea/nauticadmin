/**
 * POST /api/reconciliation/simple-confirm
 * Confirma conciliación manual: guarda en payerMappings y crea pago.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";
import { PAYER_MAPPINGS_COLLECTION } from "@/lib/reconciliation/payer-mappings";
import {
  createPayment,
  findApprovedPayment,
  updatePlayerStatus,
  playerExistsInSchool,
} from "@/lib/payments/db";
import { DEFAULT_CURRENCY } from "@/lib/payments/constants";

function normPayer(s: string): string {
  return (s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const { schoolId, payerRaw, playerId, amount, period } = body as {
      schoolId?: string;
      payerRaw?: string;
      playerId?: string;
      amount?: number;
      period?: string;
    };

    if (!schoolId || !payerRaw?.trim() || !playerId || amount == null || amount <= 0) {
      return NextResponse.json(
        { error: "Faltan schoolId, payerRaw, playerId o amount válido" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${auth.uid}`).get();
    const platformUserSnap = await db.doc(`platformUsers/${auth.uid}`).get();
    const isAdmin =
      (schoolUserSnap.exists && (schoolUserSnap.data() as { role?: string })?.role === "school_admin") ||
      (platformUserSnap.exists && (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true);
    if (!isAdmin) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

    const playerExists = await playerExistsInSchool(db, schoolId, playerId);
    if (!playerExists) {
      return NextResponse.json({ error: "El jugador no existe en esta escuela" }, { status: 400 });
    }

    const periodToUse = period ?? new Date().toISOString().slice(0, 7); // YYYY-MM
    const existing = await findApprovedPayment(db, playerId, periodToUse);
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un pago aprobado para este jugador y período" },
        { status: 409 }
      );
    }

    // 1. Guardar en payerMappings para futuras conciliaciones
    const payerKey = normPayer(payerRaw);
    const now = new Date().toISOString();
    const docId = `${payerKey}_player_${playerId}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 150);
    await db
      .collection("schools")
      .doc(schoolId)
      .collection(PAYER_MAPPINGS_COLLECTION)
      .doc(docId)
      .set({
        payerKey,
        payerRaw: payerRaw.trim(),
        targetType: "player",
        targetId: playerId,
        targetRaw: "", // se puede obtener del player si hace falta
        source: "manual",
        createdAt: now,
        createdBy: auth.uid,
      });

    // 2. Crear pago
    let collectedByDisplayName = auth.email ?? "Usuario";
    const schoolUserRef = db.collection("schools").doc(schoolId).collection("users").doc(auth.uid);
    const schoolUserSnap2 = await schoolUserRef.get();
    if (schoolUserSnap2.exists) {
      const displayName = (schoolUserSnap2.data() as { displayName?: string })?.displayName?.trim();
      if (displayName) collectedByDisplayName = displayName;
    }

    const payment = await createPayment(db, {
      playerId,
      schoolId,
      period: periodToUse,
      amount,
      currency: DEFAULT_CURRENCY,
      provider: "manual",
      status: "approved",
      paidAt: new Date(),
      metadata: {
        collectedByUid: auth.uid,
        collectedByEmail: auth.email ?? "",
        collectedByDisplayName,
        source: "bank_reconciliation",
      },
    });

    await updatePlayerStatus(db, schoolId, playerId, "active");

    return NextResponse.json({
      ok: true,
      paymentId: payment.id,
      message: "Conciliación guardada y pago creado",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliation/simple-confirm]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
