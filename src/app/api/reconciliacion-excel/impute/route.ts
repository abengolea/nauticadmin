/**
 * POST /api/reconciliacion-excel/impute
 * Acredita los pagos conciliados en la cuota más vieja de cada cliente.
 */

import { NextResponse } from "next/server";
import type admin from "firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";
import {
  createPayment,
  updatePlayerStatus,
  getOrCreatePaymentConfig,
  getUnpaidPeriodsForPlayer,
  getAllApprovedPaymentsForSchool,
} from "@/lib/payments/db";
import { sendEmailEvent } from "@/lib/payments/email-events";
import { DEFAULT_CURRENCY } from "@/lib/payments/constants";
import { normalizeString } from "@/lib/text-normalize";
import type { ImputePaymentItem } from "@/lib/reconciliacion-excel/types";
import {
  digitsOnly,
  dniFromAccountRaw,
  imputeIdempotencyKey,
  nameFromAccountRaw,
  nameSearchKeys,
  parseAplicadaFlag,
} from "@/lib/reconciliacion-excel/impute-match";

type DocSnapshot = admin.firestore.DocumentSnapshot;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function indexPlayers(playersSnap: admin.firestore.QuerySnapshot) {
  const byDni = new Map<string, DocSnapshot>();
  const byName = new Map<string, DocSnapshot>();

  for (const doc of playersSnap.docs) {
    const d = doc.data() as {
      firstName?: string;
      lastName?: string;
      dni?: string;
      tutorContact?: { name?: string };
      archived?: boolean;
    };
    if (d.archived) continue;

    const dni = digitsOnly(String(d.dni ?? ""));
    if (dni) byDni.set(dni, doc);

    const fullName = `${d.lastName ?? ""} ${d.firstName ?? ""}`.trim();
    const tutor = String(d.tutorContact?.name ?? "").trim();
    for (const raw of [fullName, tutor, `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim()]) {
      for (const key of nameSearchKeys(raw)) {
        if (key) byName.set(key, doc);
      }
    }
  }

  return { byDni, byName };
}

function findPlayer(
  item: ImputePaymentItem,
  byDni: Map<string, DocSnapshot>,
  byName: Map<string, DocSnapshot>
): DocSnapshot | undefined {
  const dniCandidates = [
    digitsOnly(item.accountKey),
    dniFromAccountRaw(item.accountRaw),
  ].filter((d) => d.length >= 6);

  for (const dni of dniCandidates) {
    const hit = byDni.get(dni);
    if (hit) return hit;
  }

  const names = [nameFromAccountRaw(item.accountRaw), item.payerRaw].filter(Boolean);
  for (const name of names) {
    for (const key of nameSearchKeys(name)) {
      const hit = byName.get(key);
      if (hit) return hit;
    }
    const exact = byName.get(normalizeString(name));
    if (exact) return exact;
  }

  return undefined;
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
      (schoolUserSnap.exists &&
        (schoolUserSnap.data() as { role?: string })?.role === "school_admin") ||
      (platformUserSnap.exists &&
        (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true);
    if (!isAdmin) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

    const body = await request.json();
    const items = (body?.items ?? []) as ImputePaymentItem[];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No hay pagos para imputar" }, { status: 400 });
    }

    const config = await getOrCreatePaymentConfig(db, schoolId);
    const currency = config.currency || DEFAULT_CURRENCY;
    const approvedPaymentsMap = await getAllApprovedPaymentsForSchool(db, schoolId);
    const playersSnap = await db.collection(`schools/${schoolId}/players`).get();
    const { byDni, byName } = indexPlayers(playersSnap);

    let collectedByDisplayName = auth.email ?? "Usuario";
    const schoolUserSnap2 = await db.doc(`schools/${schoolId}/users/${auth.uid}`).get();
    if (schoolUserSnap2.exists) {
      const dn = (schoolUserSnap2.data() as { displayName?: string })?.displayName?.trim();
      if (dn) collectedByDisplayName = dn;
    }

    let applied = 0;
    let already = 0;
    const notFound: string[] = [];
    const skipped: string[] = [];

    for (const item of items) {
      const amount = Number(item.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        skipped.push(`${item.payerRaw} (importe 0)`);
        continue;
      }

      const aplicada = parseAplicadaFlag(item.aplicada);
      if (aplicada === false) {
        skipped.push(`${item.payerRaw} (no aplicada)`);
        continue;
      }

      const playerDoc = findPlayer(item, byDni, byName);
      if (!playerDoc) {
        notFound.push(item.accountRaw || item.payerRaw);
        continue;
      }

      const idempotencyKey = imputeIdempotencyKey({
        schoolId,
        sourceKind: item.sourceKind,
        payerRaw: item.payerRaw,
        amount,
        cardLast4: item.cardLast4,
        paymentRowId: item.paymentRowId,
      });
      const existing = await db.collection("payments").doc(idempotencyKey).get();
      if (existing.exists) {
        already++;
        continue;
      }

      const unpaid = await getUnpaidPeriodsForPlayer(
        db,
        schoolId,
        playerDoc.id,
        approvedPaymentsMap
      );
      const targetPeriod = unpaid[0]?.period ?? null;
      if (!targetPeriod) {
        skipped.push(`${item.payerRaw} (sin cuotas adeudadas)`);
        continue;
      }

      const now = new Date();
      await createPayment(
        db,
        {
          playerId: playerDoc.id,
          schoolId,
          period: targetPeriod,
          amount,
          currency,
          provider: "excel_import",
          status: "approved",
          paidAt: now,
          metadata: {
            paymentMethod: item.sourceKind,
            nroTarjeta: item.cardLast4,
            dni: digitsOnly(item.accountKey) || dniFromAccountRaw(item.accountRaw),
            collectedByUid: auth.uid,
            collectedByDisplayName,
            source: "visa_excel_reconciliation",
          },
        },
        idempotencyKey
      );

      await updatePlayerStatus(db, schoolId, playerDoc.id, "active");
      applied++;

      let paidSet = approvedPaymentsMap.get(playerDoc.id);
      if (!paidSet) {
        paidSet = new Set();
        approvedPaymentsMap.set(playerDoc.id, paidSet);
      }
      paidSet.add(targetPeriod);

      const playerData = playerDoc.data() as {
        firstName?: string;
        lastName?: string;
        email?: string;
      };
      const playerName =
        `${playerData.firstName ?? ""} ${playerData.lastName ?? ""}`.trim() || "Cliente";
      if (playerData.email) {
        try {
          await sendEmailEvent({
            db: db as admin.firestore.Firestore,
            type: "payment_receipt",
            playerId: playerDoc.id,
            schoolId,
            period: targetPeriod,
            to: playerData.email,
            playerName,
            amount,
            currency,
            paidAt: now,
          });
        } catch {
          /* ignore */
        }
      }
    }

    return NextResponse.json({
      ok: true,
      applied,
      already,
      notFound: notFound.slice(0, 80),
      notFoundCount: notFound.length,
      skipped: skipped.slice(0, 40),
      skippedCount: skipped.length,
      message: `Se acreditaron ${applied} pagos.${already > 0 ? ` ${already} ya estaban imputados.` : ""}${
        notFound.length > 0 ? ` ${notFound.length} sin cliente.` : ""
      }${skipped.length > 0 ? ` ${skipped.length} omitidos.` : ""}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliacion-excel/impute]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
