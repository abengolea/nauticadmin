/**
 * Detección y fusión de mapeos de columnas (crédito / débito).
 */

import type {
  ColumnMapping,
  ExtraMappedField,
  MappingProfile,
  PaymentFileKind,
} from "./types";

export const EMPTY_COLUMN_MAPPING: ColumnMapping = {
  payer: "",
  lastName: "",
  firstName: "",
  amount: "",
  date: "",
  reference: "",
  extras: [],
};

function findHeader(headers: string[], patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const hit = headers.find((h) => pattern.test(h.trim()));
    if (hit) return hit;
  }
  return "";
}

export function isRendicionDa(headers: string[]): boolean {
  return Boolean(
    findHeader(headers, [/dato opcional 1/i, /^apellido$/i]) &&
      findHeader(headers, [/importe/i])
  );
}

export function newExtraField(label = "", column = ""): ExtraMappedField {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, label, column };
}

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const lastName = findHeader(headers, [/dato opcional 1/i, /^apellido$/i]);
  const firstName = findHeader(headers, [/dato opcional 2/i, /^nombre$/i, /^nombres$/i]);
  const payer = lastName ? "" : findHeader(headers, [/pagador/i, /titular/i, /payer/i]);
  const amount = findHeader(headers, [/importe/i, /monto/i, /amount/i]);
  const date = findHeader(headers, [/fecha/i, /date/i]);
  const reference = findHeader(headers, [/observaciones/i, /referencia/i, /^ref$/i]);
  const extras: ExtraMappedField[] = [];
  const card = findHeader(headers, [/nro tarjeta/i, /tarjeta/i]);
  const applied = findHeader(headers, [/aplicada/i]);
  if (card) extras.push({ id: "cardNumber", label: "Nro Tarjeta", column: card });
  if (applied) extras.push({ id: "applied", label: "Aplicada", column: applied });

  return {
    payer,
    lastName,
    firstName,
    amount,
    date,
    reference,
    extras,
  };
}

export function hasPayerMapping(mapping: ColumnMapping): boolean {
  return Boolean(mapping.lastName?.trim() || mapping.payer.trim());
}

function pickSavedColumn(savedCol: string, headers: string[], fallback: string): string {
  return savedCol && headers.includes(savedCol) ? savedCol : fallback;
}

/**
 * Aplica un mapeo guardado sobre los headers del archivo actual.
 * Si una columna ya no existe, deja el campo vacío (o el auto-detectado en cores).
 * Los extras se conservan para que el usuario los reasigne.
 */
export function applySavedColumnMapping(
  headers: string[],
  saved: ColumnMapping | null | undefined
): ColumnMapping {
  const detected = detectColumnMapping(headers);
  if (!saved) return detected;

  return {
    payer: pickSavedColumn(saved.payer, headers, detected.payer),
    lastName: pickSavedColumn(saved.lastName ?? "", headers, detected.lastName ?? ""),
    firstName: pickSavedColumn(saved.firstName ?? "", headers, detected.firstName ?? ""),
    amount: pickSavedColumn(saved.amount, headers, detected.amount),
    date: pickSavedColumn(saved.date, headers, detected.date),
    reference: pickSavedColumn(saved.reference, headers, detected.reference),
    extras: (saved.extras ?? [])
      .filter((e) => e.label.trim() || e.column.trim())
      .map((e) => ({
        id: e.id || newExtraField().id,
        label: e.label.trim(),
        column: e.column && headers.includes(e.column) ? e.column : "",
      })),
  };
}

export function unusedHeaders(headers: string[], mapping: ColumnMapping): string[] {
  const used = new Set(
    [
      mapping.payer,
      mapping.lastName ?? "",
      mapping.firstName ?? "",
      mapping.amount,
      mapping.date,
      mapping.reference,
      ...mapping.extras.map((e) => e.column),
    ]
      .map((h) => h.trim())
      .filter(Boolean)
  );
  return headers.filter((h) => h.trim() && !used.has(h));
}

export function fillUnusedAsExtras(headers: string[], mapping: ColumnMapping): ColumnMapping {
  const unused = unusedHeaders(headers, mapping);
  if (unused.length === 0) return mapping;
  return {
    ...mapping,
    extras: [...mapping.extras, ...unused.map((h) => newExtraField(h, h))],
  };
}

export type AiColumnMappingResult = {
  payer?: string;
  amount?: string;
  date?: string;
  reference?: string;
  extras?: Array<{ label?: string; column?: string }>;
  suggestedKind?: PaymentFileKind;
  suggestedProfileName?: string;
  notes?: string;
};

export function mappingFromAiResult(
  headers: string[],
  result: AiColumnMappingResult
): ColumnMapping {
  const pick = (col?: string) => (col && headers.includes(col) ? col : "");
  const used = new Set<string>();
  const mark = (col: string) => {
    if (col) used.add(col);
    return col;
  };

  const payer = mark(pick(result.payer));
  const amount = mark(pick(result.amount));
  const date = mark(pick(result.date));
  const reference = mark(pick(result.reference));

  const extras = (result.extras ?? [])
    .filter((e) => e?.column && headers.includes(e.column) && !used.has(e.column))
    .map((e) => {
      used.add(e.column!);
      return newExtraField((e.label || e.column!).trim(), e.column!);
    });

  const detected = detectColumnMapping(headers);
  return fillUnusedAsExtras(headers, {
    payer: payer || detected.payer,
    lastName: detected.lastName,
    firstName: detected.firstName,
    amount: amount || detected.amount,
    date: date || detected.date,
    reference: reference || detected.reference,
    extras,
  });
}

function mappedColumns(mapping: ColumnMapping): string[] {
  return [
    mapping.payer,
    mapping.lastName ?? "",
    mapping.firstName ?? "",
    mapping.amount,
    mapping.date,
    mapping.reference,
    ...mapping.extras.map((e) => e.column),
  ]
    .map((h) => h.trim())
    .filter(Boolean);
}

export function scoreProfile(headers: string[], profile: MappingProfile): number {
  const headerSet = new Set(headers);
  const hasPayerCol =
    (profile.mapping.lastName && headerSet.has(profile.mapping.lastName)) ||
    (profile.mapping.payer && headerSet.has(profile.mapping.payer));
  if (!hasPayerCol && (profile.mapping.payer || profile.mapping.lastName)) return 0;
  if (profile.mapping.amount && !headerSet.has(profile.mapping.amount)) return 0;
  return mappedColumns(profile.mapping).filter((c) => headerSet.has(c)).length;
}

export function findBestProfile(
  headers: string[],
  profiles: MappingProfile[],
  kind?: PaymentFileKind
): MappingProfile | null {
  const preferred = kind ? profiles.filter((p) => p.kind === kind) : profiles;
  const pools = preferred.length > 0 ? [preferred, profiles] : [profiles];

  let best: MappingProfile | null = null;
  let bestScore = 0;
  for (const pool of pools) {
    for (const profile of pool) {
      const score = scoreProfile(headers, profile);
      if (score > bestScore) {
        best = profile;
        bestScore = score;
      }
    }
    if (bestScore >= 2) return best;
  }
  return bestScore >= 2 ? best : null;
}

export function shouldInviteNewProfileName(
  headers: string[],
  mapping: ColumnMapping,
  selectedProfile: { name: string; headers?: string[]; mapping?: ColumnMapping } | null | undefined
): { invite: boolean; unused: string[] } {
  const unused = unusedHeaders(headers, mapping);
  if (!selectedProfile) return { invite: false, unused };

  const known = new Set(
    (selectedProfile.headers?.length
      ? selectedProfile.headers
      : selectedProfile.mapping
        ? mappedColumns(selectedProfile.mapping)
        : []
    )
      .map((h) => h.trim())
      .filter(Boolean)
  );
  const extraInFile = known.size
    ? headers.filter((h) => h.trim() && !known.has(h))
    : unused;

  return {
    invite: extraInFile.length > 0,
    unused: extraInFile.length > 0 ? extraInFile : unused,
  };
}

export function namesClash(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function mappingProfileId(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return slug || `perfil_${Date.now()}`;
}

export function normalizeMappingProfile(id: string, raw: unknown): MappingProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<MappingProfile> & { mapping?: unknown };
  const mapping = normalizeColumnMapping(data.mapping);
  if (!mapping) return null;
  const name = String(data.name ?? "").trim();
  if (!name) return null;
  const kind: PaymentFileKind = data.kind === "debit" ? "debit" : "credit";
  const headers = Array.isArray(data.headers)
    ? data.headers.map((h) => String(h ?? "").trim()).filter(Boolean)
    : [];
  return {
    id,
    name,
    kind,
    mapping,
    headers,
    updatedAt: String(data.updatedAt ?? ""),
  };
}

export function normalizeColumnMapping(raw: unknown): ColumnMapping | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<ColumnMapping>;
  const extras = Array.isArray(m.extras)
    ? m.extras
        .filter((e): e is ExtraMappedField => !!e && typeof e === "object")
        .slice(0, 20)
        .map((e) => ({
          id: String(e.id || newExtraField().id).slice(0, 80),
          label: String(e.label ?? "").trim().slice(0, 80),
          column: String(e.column ?? "").trim().slice(0, 120),
        }))
        .filter((e) => e.label || e.column)
    : [];

  return {
    payer: String(m.payer ?? "").trim(),
    lastName: String(m.lastName ?? "").trim(),
    firstName: String(m.firstName ?? "").trim(),
    amount: String(m.amount ?? "").trim(),
    date: String(m.date ?? "").trim(),
    reference: String(m.reference ?? "").trim(),
    extras,
  };
}
