/**
 * payerMappings: fusión de recExcelRelations + recPayerAliases.
 * Unifica Pagador → Cuenta/Cliente en una sola colección.
 */

export const PAYER_MAPPINGS_COLLECTION = "payerMappings";

export type PayerMappingSource = "excel" | "bank_import" | "manual";

export type PayerMappingTargetType = "account" | "player";

export type PayerMapping = {
  payerKey: string;
  payerRaw: string;
  targetType: PayerMappingTargetType;
  targetId: string;
  targetRaw: string;
  source: PayerMappingSource;
  createdAt: string;
  createdBy?: string;
};

/** Vista para el matcher Excel (targetType=account). */
export type PayerMappingAsRelation = {
  accountKey: string;
  accountRaw: string;
  payerKey: string;
  payerRaw: string;
};

export function toRelationView(m: PayerMapping): PayerMappingAsRelation | null {
  if (m.targetType !== "account") return null;
  return {
    accountKey: m.targetId,
    accountRaw: m.targetRaw,
    payerKey: m.payerKey,
    payerRaw: m.payerRaw,
  };
}

export function mappingsToRelations(mappings: PayerMapping[]): PayerMappingAsRelation[] {
  return mappings
    .filter((m) => m.targetType === "account")
    .map((m) => ({
      accountKey: m.targetId,
      accountRaw: m.targetRaw,
      payerKey: m.payerKey,
      payerRaw: m.payerRaw,
    }));
}
