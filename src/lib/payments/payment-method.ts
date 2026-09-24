/**
 * Medios de cobro que ve el usuario (efectivo, transferencia, etc.).
 * Distinto de `provider`, que es el canal técnico (webhook, Excel, carga manual).
 */

export const PAYMENT_METHOD_VALUES = [
  "transfer",
  "cash",
  "cheque",
  "mercadopago",
  "card",
  "excel_import",
  "manual",
  "dlocal",
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHOD_VALUES)[number];

/** Medios que se eligen al registrar un cobro a mano */
export const REGISTER_PAYMENT_METHODS = [
  "transfer",
  "cash",
  "cheque",
  "mercadopago",
  "card",
] as const;

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  transfer: "Transferencia",
  cash: "Efectivo",
  cheque: "Cheque",
  mercadopago: "Mercado Pago",
  card: "Tarjeta",
  excel_import: "Excel",
  excel: "Excel",
  manual: "Manual",
  unknown: "Manual",
  dlocal: "DLocal",
  stripe: "Tarjeta",
};

export const PAYMENT_METHOD_ENUM = [
  "card",
  "transfer",
  "cash",
  "cheque",
  "mercadopago",
  "unknown",
] as const;

type PaymentMethodSource = {
  method?: string | null;
  provider?: string | null;
  chequeDueDate?: string | null;
  chequeStatus?: string | null;
};

/** Infiere el medio de cobro a mostrar. Nunca usa el nombre de quien cargó el pago. */
export function inferPaymentMethod(p: PaymentMethodSource): PaymentMethodKey {
  if (p.provider === "mercadopago") return "mercadopago";
  if (p.provider === "excel_import") return "excel_import";
  if (p.provider === "dlocal") return "dlocal";

  const method = p.method?.trim();
  if (method && method !== "unknown") {
    if (method === "excel" || method === "excel_import") return "excel_import";
    if (method in PAYMENT_METHOD_LABELS) return method as PaymentMethodKey;
  }

  if (p.chequeDueDate || p.chequeStatus) return "cheque";
  if (p.provider === "transfer") return "transfer";
  if (p.provider === "stripe") return "card";
  return "manual";
}

export function getPaymentMethodLabel(p: PaymentMethodSource): string {
  return PAYMENT_METHOD_LABELS[inferPaymentMethod(p)] ?? "Manual";
}
