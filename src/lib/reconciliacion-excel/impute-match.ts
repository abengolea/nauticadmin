/**
 * Helpers para resolver a qué cliente imputar un pago conciliado.
 */

import { normalizeString } from "../text-normalize";

export function digitsOnly(value: string): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** null = no hay dato; true/false según Aplicada. */
export function parseAplicadaFlag(val: unknown): boolean | null {
  if (val == null) return null;
  const s = String(val).toLowerCase().trim();
  if (!s) return null;
  if (["sí", "si", "yes", "true", "1", "s", "x"].includes(s)) return true;
  if (["no", "false", "0", "n"].includes(s)) return false;
  return null;
}

export function nameFromAccountRaw(accountRaw: string): string {
  return String(accountRaw ?? "").split("·")[0].trim();
}

export function dniFromAccountRaw(accountRaw: string): string {
  const m = String(accountRaw ?? "").match(/DNI\s*([0-9.\s-]+)/i);
  return digitsOnly(m?.[1] ?? "");
}

export function nameSearchKeys(name: string): string[] {
  const n = normalizeString(name);
  if (!n) return [];
  const parts = n.split(" ").filter(Boolean);
  const keys = new Set<string>([n]);
  if (parts.length >= 2) {
    keys.add(`${parts.slice(1).join(" ")} ${parts[0]}`);
  }
  return [...keys];
}

export function imputeIdempotencyKey(params: {
  schoolId: string;
  sourceKind?: string;
  payerRaw: string;
  amount: number;
  cardLast4?: string;
  paymentRowId: string;
}): string {
  const payer = normalizeString(params.payerRaw).replace(/\s+/g, "_").slice(0, 40);
  const amountCents = String(Math.round((params.amount ?? 0) * 100));
  const last4 = digitsOnly(params.cardLast4 ?? "").slice(-4);
  return [
    "visaex",
    params.schoolId.slice(0, 24),
    params.sourceKind ?? "credit",
    payer,
    amountCents,
    last4 || params.paymentRowId,
  ]
    .join("_")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 150);
}
