/**
 * Persiste alias listado/pagador → player_id para futuras imputaciones Visa.
 */

import type admin from "firebase-admin";
import { REC_COLLECTIONS } from "../reconciliation";
import { normalizeString } from "../text-normalize";
import { imputeTargetNames, nameFromAccountRaw } from "./impute-match";
import { payerNameKeys } from "./player-lookup";
import type { ImputePaymentItem } from "./types";

export function aliasDocId(normalizedName: string): string {
  return normalizedName.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 150);
}

/** Nombres a persistir para que el mes siguiente matchee sin intervención manual. */
export function buildPersistedAliasNames(item: ImputePaymentItem): string[] {
  const names = new Set<string>();
  const add = (raw: string | undefined) => {
    const t = String(raw ?? "").trim();
    if (t) names.add(t);
  };

  for (const n of imputeTargetNames(item)) {
    add(n);
    for (const key of payerNameKeys(n)) {
      if (key) names.add(key);
    }
  }
  add(item.payerRaw);
  add(nameFromAccountRaw(item.accountRaw));
  if (item.listadoLastName || item.listadoFirstName) {
    add([item.listadoLastName, item.listadoFirstName].filter(Boolean).join(" "));
  }

  return [...names];
}

export function aliasNamesForItem(item: ImputePaymentItem): string[] {
  return buildPersistedAliasNames(item);
}

export async function savePlayerAliases(
  db: admin.firestore.Firestore,
  opts: {
    schoolId: string;
    playerId: string;
    aliasNames: string[];
    uid: string;
  }
): Promise<number> {
  const { schoolId, playerId, aliasNames, uid } = opts;
  const playerRef = db.doc(`schools/${schoolId}/players/${playerId}`);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) {
    throw new Error("Cliente no encontrado");
  }

  const now = new Date().toISOString();
  let saved = 0;
  const seen = new Set<string>();

  for (const raw of aliasNames) {
    const normalized = normalizeString(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    const aliasRef = db
      .collection("schools")
      .doc(schoolId)
      .collection(REC_COLLECTIONS.payerAliases)
      .doc(aliasDocId(normalized));

    const existing = await aliasRef.get();
    if (existing.exists) {
      const prev = existing.data() as { player_id?: string };
      if (prev.player_id !== playerId) {
        await aliasRef.update({
          player_id: playerId,
          updated_at: now,
          updated_by: uid,
        });
        saved++;
      }
    } else {
      await aliasRef.set({
        normalized_payer_name: normalized,
        player_id: playerId,
        created_at: now,
        created_by: uid,
        source: "visa_excel_manual",
      });
      saved++;
    }
  }

  return saved;
}
