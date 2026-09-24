/**
 * Resuelve cliente del listado Visa → ficha en la náutica (col G = imputar y facturar).
 */

import type admin from "firebase-admin";
import { REC_COLLECTIONS } from "../reconciliation";
import { normalizeString } from "../text-normalize";
import type { ImputePaymentItem } from "./types";
import { digitsOnly, dniFromAccountRaw, imputeTargetNames, nameSearchKeys } from "./impute-match";
import { fuzzyNameScore, normalizeLegalName } from "./name-fuzzy";

const normalizeName = normalizeString;
type DocSnapshot = admin.firestore.DocumentSnapshot;

export type PlayerMatchKind = "dni" | "exact" | "alias" | "fuzzy" | "none";

export type PlayerMatchResult = {
  doc?: DocSnapshot;
  kind: PlayerMatchKind;
  score?: number;
  /** Nombre buscado (listado / col G). */
  targetName?: string;
  /** Nombre en NauticAdmin. */
  matchedName?: string;
};

export type PlayerLookup = {
  findPlayer: (item: ImputePaymentItem) => DocSnapshot | undefined;
  resolvePlayerMatch: (item: ImputePaymentItem) => PlayerMatchResult;
};

function dniKeys(dni: string): string[] {
  const d = digitsOnly(dni);
  if (!d) return [];
  const keys = new Set<string>([d]);
  if (d.length <= 8) keys.add(d.padStart(8, "0"));
  if (d.length <= 7) keys.add(d.padStart(7, "0"));
  return [...keys];
}

export function nameVariants(apellido: string, nombre: string): string[] {
  const a = apellido.trim();
  const n = nombre.trim();
  const variants: string[] = [];
  if (a || n) {
    const an = `${a} ${n}`.trim();
    const na = `${n} ${a}`.trim();
    variants.push(normalizeString(an));
    if (na !== an) variants.push(normalizeString(na));
  }
  return variants;
}

export function payerNameKeys(payerRaw: string): string[] {
  const trimmed = payerRaw.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const keys = new Set<string>(nameSearchKeys(trimmed));
  if (parts.length >= 2) {
    for (const v of nameVariants(parts[0]!, parts.slice(1).join(" "))) {
      keys.add(v);
    }
  }
  return [...keys];
}

function playerDisplayName(d: { firstName?: string; lastName?: string }): string {
  return `${d.lastName ?? ""} ${d.firstName ?? ""}`.trim();
}

export async function buildPlayerLookup(
  db: admin.firestore.Firestore,
  schoolId: string
): Promise<PlayerLookup> {
  const playersSnap = await db.collection(`schools/${schoolId}/players`).get();
  const [aliasesSnap, recClientsSnap] = await Promise.all([
    db.collection("schools").doc(schoolId).collection(REC_COLLECTIONS.payerAliases).get(),
    db.collection("schools").doc(schoolId).collection(REC_COLLECTIONS.clients).get(),
  ]);

  const byDni = new Map<string, DocSnapshot>();
  const byName = new Map<string, DocSnapshot>();

  for (const doc of playersSnap.docs) {
    const d = doc.data() as {
      firstName?: string;
      lastName?: string;
      dni?: string;
      usuarioId?: string;
      tutorContact?: { name?: string };
      archived?: boolean;
    };
    if (d.archived) continue;

    for (const key of dniKeys(String(d.dni ?? ""))) {
      byDni.set(key, doc);
    }
    const usuarioId = String(d.usuarioId ?? "").trim();
    if (usuarioId) byDni.set(digitsOnly(usuarioId), doc);

    const fullName = playerDisplayName(d);
    const tutor = String(d.tutorContact?.name ?? "").trim();
    for (const raw of [fullName, tutor, `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim()]) {
      for (const key of nameSearchKeys(raw)) {
        if (key) byName.set(key, doc);
      }
      const parts = raw.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        for (const v of nameVariants(parts[0]!, parts.slice(1).join(" "))) {
          byName.set(v, doc);
        }
      }
    }
    for (const v of nameVariants(d.lastName ?? "", d.firstName ?? "")) {
      if (v) byName.set(v, doc);
    }
  }

  const recClientsById = new Map<string, { full_name_raw: string }>();
  for (const d of recClientsSnap.docs) {
    const data = d.data() as { full_name_raw?: string };
    if (data.full_name_raw) recClientsById.set(d.id, { full_name_raw: data.full_name_raw });
  }

  const recClientIdToPlayer = new Map<string, DocSnapshot>();
  for (const [clientId, rec] of recClientsById) {
    const raw = rec.full_name_raw;
    let ap = "";
    let nom = "";
    if (raw.includes(",")) {
      const parts = raw.split(",").map((p) => p.trim());
      ap = parts[0] ?? "";
      nom = parts.slice(1).join(" ").trim();
    } else {
      const parts = raw.trim().split(/\s+/);
      ap = parts[0] ?? "";
      nom = parts.slice(1).join(" ").trim();
    }
    for (const key of nameVariants(ap, nom)) {
      const playerDoc = byName.get(key);
      if (playerDoc) {
        recClientIdToPlayer.set(clientId, playerDoc);
        break;
      }
    }
    if (!recClientIdToPlayer.has(clientId) && raw) {
      const playerDoc = byName.get(normalizeString(raw));
      if (playerDoc) recClientIdToPlayer.set(clientId, playerDoc);
    }
  }

  const aliasToPlayer = new Map<string, DocSnapshot>();
  const playersById = new Map(playersSnap.docs.map((d) => [d.id, d]));
  const activePlayerDocs = playersSnap.docs.filter((doc) => {
    const d = doc.data() as { archived?: boolean; lastName?: string; firstName?: string };
    if (d.archived) return false;
    const full = playerDisplayName(d);
    return !normalizeString(full).startsWith("ZZ ");
  });

  for (const d of aliasesSnap.docs) {
    const data = d.data() as {
      normalized_payer_name?: string;
      client_id?: string;
      player_id?: string;
    };
    const payerNorm = data.normalized_payer_name ?? "";
    if (!payerNorm) continue;
    let playerDoc: DocSnapshot | undefined;
    if (data.player_id) playerDoc = playersById.get(data.player_id);
    if (!playerDoc && data.client_id) playerDoc = recClientIdToPlayer.get(data.client_id);
    if (playerDoc) aliasToPlayer.set(payerNorm, playerDoc);
  }

  function resolvePlayerMatch(item: ImputePaymentItem): PlayerMatchResult {
    const dniCandidates = [
      digitsOnly(item.dni ?? ""),
      digitsOnly(item.accountKey),
      dniFromAccountRaw(item.accountRaw),
    ].filter((d) => d.length >= 6);

    for (const dni of dniCandidates) {
      for (const key of dniKeys(dni)) {
        const hit = byDni.get(key);
        if (hit) {
          const d = hit.data() as { firstName?: string; lastName?: string };
          return {
            doc: hit,
            kind: "dni",
            targetName: imputeTargetNames(item)[0],
            matchedName: playerDisplayName(d),
          };
        }
      }
    }

    for (const name of imputeTargetNames(item)) {
      for (const key of payerNameKeys(name)) {
        const hit = byName.get(key);
        if (hit) {
          const d = hit.data() as { firstName?: string; lastName?: string };
          return { doc: hit, kind: "exact", targetName: name, matchedName: playerDisplayName(d) };
        }
      }
      for (const key of nameSearchKeys(name)) {
        const hit = byName.get(key);
        if (hit) {
          const d = hit.data() as { firstName?: string; lastName?: string };
          return { doc: hit, kind: "exact", targetName: name, matchedName: playerDisplayName(d) };
        }
      }
      const aliasHit = aliasToPlayer.get(normalizeName(name));
      if (aliasHit) {
        const d = aliasHit.data() as { firstName?: string; lastName?: string };
        return {
          doc: aliasHit,
          kind: "alias",
          targetName: name,
          matchedName: playerDisplayName(d),
        };
      }
    }

    for (const name of imputeTargetNames(item)) {
      const scored = activePlayerDocs
        .map((doc) => {
          const d = doc.data() as { firstName?: string; lastName?: string };
          const display = playerDisplayName(d);
          return { doc, score: fuzzyNameScore(name, display), display };
        })
        .filter((x) => x.score >= 0.72)
        .sort((a, b) => b.score - a.score);

      if (scored.length === 0) continue;

      const best = scored[0]!;
      const second = scored[1];
      if (
        !second ||
        best.score - second.score >= 0.1 ||
        normalizeLegalName(best.display) === normalizeLegalName(second.display)
      ) {
        return {
          doc: best.doc,
          kind: "fuzzy",
          score: best.score,
          targetName: name,
          matchedName: best.display,
        };
      }
    }

    return { kind: "none", targetName: imputeTargetNames(item)[0] };
  }

  function findPlayer(item: ImputePaymentItem): DocSnapshot | undefined {
    const m = resolvePlayerMatch(item);
    return m.doc;
  }

  return { findPlayer, resolvePlayerMatch };
}
