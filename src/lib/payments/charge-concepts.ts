/** Conceptos de cobro que no son cuota mensual ni inscripción. */
export const SERVICE_CHARGE_CONCEPTS = [
  "Amarra",
  "Lavado de lancha",
  "Venta de insumos",
  "Mantenimiento embarcación",
  "Guardería adicional",
  "Uso de grúa",
] as const;

export type ManualChargeKind = "monthly" | "registration" | "service";

export const MANUAL_CHARGE_TYPE_MONTHLY = "monthly";
export const MANUAL_CHARGE_TYPE_REGISTRATION = "registration";
export const MANUAL_CHARGE_TYPE_OTHER = "other";

export const MANUAL_CHARGE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: MANUAL_CHARGE_TYPE_MONTHLY, label: "Cuota mensual" },
  { value: MANUAL_CHARGE_TYPE_REGISTRATION, label: "Inscripción" },
  ...SERVICE_CHARGE_CONCEPTS.map((concept) => ({ value: concept, label: concept })),
  { value: MANUAL_CHARGE_TYPE_OTHER, label: "Otra" },
];

export function resolveManualCharge(
  chargeType: string,
  customConcept: string
): { kind: ManualChargeKind; concept?: string } | { error: string } {
  const type = chargeType.trim();
  if (type === MANUAL_CHARGE_TYPE_MONTHLY) {
    return { kind: "monthly" };
  }
  if (type === MANUAL_CHARGE_TYPE_REGISTRATION) {
    return { kind: "registration" };
  }
  if (type === MANUAL_CHARGE_TYPE_OTHER) {
    const concept = customConcept.trim();
    if (!concept) {
      return { error: "Completá el concepto de cobro." };
    }
    return { kind: "service", concept };
  }
  if ((SERVICE_CHARGE_CONCEPTS as readonly string[]).includes(type)) {
    return { kind: "service", concept: type };
  }
  return { error: "Elegí qué se cobra." };
}
