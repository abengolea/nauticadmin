import { describe, expect, it } from "vitest";
import { markManualPaymentSchema } from "../../lib/payments/schemas";

const basePayment = {
  playerId: "player-1",
  schoolId: "school-1",
  period: "2026-10",
  amount: 100,
  currency: "ARS",
};

describe("markManualPaymentSchema", () => {
  it("acepta fecha, concepto y tarjetas diferenciadas", () => {
    const parsed = markManualPaymentSchema.safeParse({
      ...basePayment,
      paidAt: "2026-10-13",
      concept: "Cuota mensual — octubre 2026",
      method: "card_credit",
    });

    expect(parsed.success).toBe(true);
  });

  it("rechaza fechas inexistentes", () => {
    const parsed = markManualPaymentSchema.safeParse({
      ...basePayment,
      paidAt: "2026-02-31",
      method: "card_debit",
    });

    expect(parsed.success).toBe(false);
  });
});
