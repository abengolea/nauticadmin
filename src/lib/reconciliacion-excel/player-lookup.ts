/**
 * Resuelve pagador del listado Visa → cliente en la náutica.
 * Misma lógica que import-excel: DNI, nombre, alias.
 */

import type admin from "firebase-admin";
import { REC_COLLECTIONS } from "../reconciliation";
import { normalizeString } from "../text-normalize";

const normalizeName = normalizeString;
import type { ImputePaymentItem } from "./types";
import { digitsOnly, dniFromAccountRaw, nameFromAccountRaw, nameSearchKeys } from "./impute-match";

type DocSnapshot = admin.firestore.DocumentSnapshot;

export type PlayerLookup = {
  findPlayer: (item: ImputePaymentItem) => DocSnapshot | undefined;
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

    const fullName = `${d.lastName ?? ""} ${d.firstName ?? ""}`.trim();
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

  function findPlayer(item: ImputePaymentItem): DocSnapshot | undefined {
    const dniCandidates = [
      digitsOnly(item.accountKey),
      dniFromAccountRaw(item.accountRaw),
    ].filter((d) => d.length >= 6);

    for (const dni of dniCandidates) {
      for (const key of dniKeys(dni)) {
        const hit = byDni.get(key);
        if (hit) return hit;
      }
    }

    const names = [nameFromAccountRaw(item.accountRaw), item.payerRaw].filter(Boolean);
    for (const name of names) {
      for (const key of payerNameKeys(name)) {
        const hit = byName.get(key);
        if (hit) return hit;
      }
      const aliasHit = aliasToPlayer.get(normalizeName(name));
      if (aliasHit) return aliasHit;
    }

    return undefined;
  }

  return { findPlayer };
}
