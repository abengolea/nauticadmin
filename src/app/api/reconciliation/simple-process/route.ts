/**
 * POST /api/reconciliation/simple-process
 * Flujo simplificado: un solo Excel de pagos, matching contra players + aliases.
 * Devuelve conciliados y sin conciliar.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";
import { normalizeAndTokenize } from "@/lib/reconciliation/normalize";
import { tokenSetRatio } from "@/lib/reconciliation/scoring";
import { PAYER_MAPPINGS_COLLECTION } from "@/lib/reconciliation/payer-mappings";
import type { PayerMapping } from "@/lib/reconciliation/payer-mappings";

export type SimplePaymentInput = {
  payerRaw: string;
  amount: number;
  date?: string;
  reference?: string;
};

export type SimpleMatchResult = {
  payerRaw: string;
  amount: number;
  date?: string;
  reference?: string;
  playerId: string | null;
  playerName: string;
  status: "matched" | "unmatched";
  matchType?: "alias" | "exact" | "fuzzy";
};

function normForMatch(s: string): string {
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
    const { schoolId, payments } = body as {
      schoolId?: string;
      payments?: SimplePaymentInput[];
    };

    if (!schoolId || !Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json(
        { error: "Faltan schoolId o payments (array)" },
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

    // 1. Cargar players
    const playersSnap = await db.collection(`schools/${schoolId}/players`).get();
    const players = playersSnap.docs.map((d) => {
      const data = d.data() as { firstName?: string; lastName?: string; tutorContact?: { name?: string } };
      const fullName = (data.tutorContact?.name ?? `${data.lastName ?? ""} ${data.firstName ?? ""}`.trim()).trim();
      return { id: d.id, displayName: fullName || "Sin nombre" };
    });

    // 2. Cargar payerMappings (targetType=player) y recPayerAliases
    const [mappingsSnap, aliasesSnap] = await Promise.all([
      db
        .collection("schools")
        .doc(schoolId)
        .collection(PAYER_MAPPINGS_COLLECTION)
        .where("targetType", "==", "player")
        .get(),
      db
        .collection("schools")
        .doc(schoolId)
        .collection("recPayerAliases")
        .get(),
    ]);

    const payerToPlayer = new Map<string, string>();
    for (const d of mappingsSnap.docs) {
      const m = d.data() as PayerMapping;
      const key = normForMatch(m.payerRaw ?? m.payerKey ?? "");
      if (key && m.targetId) payerToPlayer.set(key, m.targetId);
    }
    for (const d of aliasesSnap.docs) {
      const data = d.data() as { normalized_payer_name?: string; player_id?: string };
      if (data.normalized_payer_name && data.player_id) {
        payerToPlayer.set(normForMatch(data.normalized_payer_name), data.player_id);
      }
    }

    // 3. Matching
    const matched: SimpleMatchResult[] = [];
    const unmatched: SimpleMatchResult[] = [];

    for (const p of payments) {
      const payerNorm = normForMatch(p.payerRaw ?? "");
      if (!payerNorm) {
        unmatched.push({
          payerRaw: p.payerRaw,
          amount: p.amount,
          date: p.date,
          reference: p.reference,
          playerId: null,
          playerName: "",
          status: "unmatched",
        });
        continue;
      }

      // Alias directo
      const aliasPlayerId = payerToPlayer.get(payerNorm);
      if (aliasPlayerId) {
        const player = players.find((pl) => pl.id === aliasPlayerId);
        matched.push({
          payerRaw: p.payerRaw,
          amount: p.amount,
          date: p.date,
          reference: p.reference,
          playerId: aliasPlayerId,
          playerName: player?.displayName ?? aliasPlayerId,
          status: "matched",
          matchType: "alias",
        });
        continue;
      }

      // Fuzzy contra players
      const { tokens: payerTokens } = normalizeAndTokenize(p.payerRaw);
      const scored = players
        .map((pl) => {
          const { tokens } = normalizeAndTokenize(pl.displayName);
          const score = tokenSetRatio(payerTokens, tokens);
          return { player: pl, score };
        })
        .filter((s) => s.score >= 75)
        .sort((a, b) => b.score - a.score);

      const top1 = scored[0];
      const top2 = scored[1];
      const gap = top1 ? (top2 ? top1.score - top2.score : 10) : 0;

      if (top1 && top1.score >= 90 && gap >= 10) {
        matched.push({
          payerRaw: p.payerRaw,
          amount: p.amount,
          date: p.date,
          reference: p.reference,
          playerId: top1.player.id,
          playerName: top1.player.displayName,
          status: "matched",
          matchType: top1.score === 100 ? "exact" : "fuzzy",
        });
      } else {
        unmatched.push({
          payerRaw: p.payerRaw,
          amount: p.amount,
          date: p.date,
          reference: p.reference,
          playerId: null,
          playerName: top1 ? top1.player.displayName : "",
          status: "unmatched",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      matched,
      unmatched,
      total: payments.length,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconciliation/simple-process]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
