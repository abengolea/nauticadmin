/**
 * Lógica compartida de imputación y simulación (dry-run).
 * Match exacto/DNI → automático. Match fuzzy → requiere aprobación del admin.
 */

import type admin from "firebase-admin";
import {
  createPayment,
  updatePlayerStatus,
  getOrCreatePaymentConfig,
  getAllApprovedPaymentsForSchool,
} from "@/lib/payments/db";
import { sendEmailEvent } from "@/lib/payments/email-events";
import { DEFAULT_CURRENCY } from "@/lib/payments/constants";
import type { ImputePaymentItem } from "./types";
import {
  digitsOnly,
  dniFromAccountRaw,
  imputeIdempotencyKey,
  parseAplicadaFlag,
} from "./impute-match";
import { buildPlayerLookup } from "./player-lookup";

export type ImputePlanEntry = {
  paymentRowId: string;
  payerRaw: string;
  amount: number;
  playerId: string;
  playerName: string;
  accountRaw: string;
};

export type DoubtfulImputeEntry = {
  paymentRowId: string;
  payerRaw: string;
  amount: number;
  targetName: string;
  suggestedPlayerId: string;
  suggestedPlayerName: string;
  score: number;
};

export type ImputeRunResult = {
  applied: number;
  already: number;
  alreadyPaidPeriod: number;
  period: string;
  notFound: string[];
  notFoundCount: number;
  skipped: string[];
  skippedCount: number;
  doubtful: DoubtfulImputeEntry[];
  doubtfulCount: number;
  pendingDoubtfulCount: number;
  totalAmount: number;
  wouldApply: ImputePlanEntry[];
  message: string;
};

function playerDisplayName(data: {
  firstName?: string;
  lastName?: string;
}): string {
  return `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || "Cliente";
}

function buildMessage(result: Omit<ImputeRunResult, "message">, simulate: boolean): string {
  const verb = simulate ? "Se imputarían" : "Se acreditaron";
  let msg = `${verb} ${result.applied} pagos en ${result.period}.`;
  if (result.pendingDoubtfulCount > 0) {
    msg += ` ${result.pendingDoubtfulCount} dudosos esperan confirmación.`;
  }
  if (result.already > 0) msg += ` ${result.already} ya estaban imputados.`;
  if (result.notFoundCount > 0) {
    msg += ` ${result.notFoundCount} sin cliente en la náutica.`;
  }
  if (result.skippedCount > 0) msg += ` ${result.skippedCount} omitidos.`;
  if (simulate) msg += " (simulación — no se guardó nada)";
  return msg;
}

export async function runImputePlan(
  db: admin.firestore.Firestore,
  opts: {
    schoolId: string;
    items: ImputePaymentItem[];
    period: string;
    simulate?: boolean;
    approvedFuzzyIds?: Set<string>;
    collectedByUid?: string;
    collectedByDisplayName?: string;
  }
): Promise<ImputeRunResult> {
  const {
    schoolId,
    items,
    period,
    simulate = false,
    approvedFuzzyIds = new Set(),
    collectedByUid,
    collectedByDisplayName,
  } = opts;

  const config = await getOrCreatePaymentConfig(db, schoolId);
  const currency = config.currency || DEFAULT_CURRENCY;
  const approvedPaymentsMap = await getAllApprovedPaymentsForSchool(db, schoolId);
  const { resolvePlayerMatch } = await buildPlayerLookup(db, schoolId);

  let applied = 0;
  let already = 0;
  let alreadyPaidPeriod = 0;
  let totalAmount = 0;
  const notFound: string[] = [];
  const skipped: string[] = [];
  const wouldApply: ImputePlanEntry[] = [];
  const doubtful: DoubtfulImputeEntry[] = [];
  let pendingDoubtfulCount = 0;

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

    const match = resolvePlayerMatch(item);
    if (match.kind === "none" || !match.doc) {
      notFound.push(item.accountRaw || item.payerRaw);
      continue;
    }

    if (match.kind === "fuzzy" && !approvedFuzzyIds.has(item.paymentRowId)) {
      pendingDoubtfulCount++;
      if (doubtful.length < 100) {
        doubtful.push({
          paymentRowId: item.paymentRowId,
          payerRaw: item.payerRaw,
          amount,
          targetName: match.targetName ?? item.payerRaw,
          suggestedPlayerId: match.doc.id,
          suggestedPlayerName: match.matchedName ?? match.doc.id,
          score: match.score ?? 0,
        });
      }
      continue;
    }

    const playerDoc = match.doc;
    const paidPeriods = approvedPaymentsMap.get(playerDoc.id);
    if (paidPeriods?.has(period)) {
      alreadyPaidPeriod++;
      skipped.push(`${item.payerRaw} (ya pagó ${period})`);
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

    const playerData = playerDoc.data() as {
      firstName?: string;
      lastName?: string;
      email?: string;
    };
    const playerName = playerDisplayName(playerData);

    if (simulate) {
      applied++;
      totalAmount += amount;
      if (wouldApply.length < 80) {
        wouldApply.push({
          paymentRowId: item.paymentRowId,
          payerRaw: item.payerRaw,
          amount,
          playerId: playerDoc.id,
          playerName,
          accountRaw: item.accountRaw,
        });
      }
      let paidSet = approvedPaymentsMap.get(playerDoc.id);
      if (!paidSet) {
        paidSet = new Set();
        approvedPaymentsMap.set(playerDoc.id, paidSet);
      }
      paidSet.add(period);
      continue;
    }

    const now = new Date();
    await createPayment(
      db,
      {
        playerId: playerDoc.id,
        schoolId,
        period,
        amount,
        currency,
        provider: "excel_import",
        status: "approved",
        paidAt: now,
        metadata: {
          paymentMethod: item.sourceKind,
          nroTarjeta: item.cardLast4,
          dni: digitsOnly(item.accountKey) || dniFromAccountRaw(item.accountRaw),
          collectedByUid,
          collectedByDisplayName,
          source: "visa_excel_reconciliation",
          matchKind: match.kind,
        },
      },
      idempotencyKey
    );

    await updatePlayerStatus(db, schoolId, playerDoc.id, "active");
    applied++;
    totalAmount += amount;

    let paidSet = approvedPaymentsMap.get(playerDoc.id);
    if (!paidSet) {
      paidSet = new Set();
      approvedPaymentsMap.set(playerDoc.id, paidSet);
    }
    paidSet.add(period);

    if (playerData.email) {
      try {
        await sendEmailEvent({
          db,
          type: "payment_receipt",
          playerId: playerDoc.id,
          schoolId,
          period,
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

  const base = {
    applied,
    already,
    alreadyPaidPeriod,
    period,
    notFound: notFound.slice(0, 80),
    notFoundCount: notFound.length,
    skipped: skipped.slice(0, 40),
    skippedCount: skipped.length,
    doubtful,
    doubtfulCount: doubtful.length,
    pendingDoubtfulCount,
    totalAmount,
    wouldApply,
  };

  return {
    ...base,
    message: buildMessage(base, simulate),
  };
}
