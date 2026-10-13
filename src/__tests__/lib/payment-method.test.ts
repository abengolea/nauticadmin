import { describe, expect, it } from "vitest";
import { getPaymentMethodLabel, inferPaymentMethod } from "../../lib/payments/payment-method";

describe("inferPaymentMethod", () => {
  it("prioriza Mercado Pago y conserva Excel cuando no conoce el tipo de tarjeta", () => {
    expect(inferPaymentMethod({ provider: "mercadopago", method: "card" })).toBe("mercadopago");
    expect(inferPaymentMethod({ provider: "excel_import" })).toBe("excel_import");
  });

  it("usa el medio cargado en cobros manuales", () => {
    expect(inferPaymentMethod({ provider: "manual", method: "cash" })).toBe("cash");
    expect(inferPaymentMethod({ provider: "manual", method: "transfer" })).toBe("transfer");
    expect(inferPaymentMethod({ provider: "manual", method: "cheque" })).toBe("cheque");
    expect(inferPaymentMethod({ provider: "manual", method: "mercadopago" })).toBe("mercadopago");
    expect(inferPaymentMethod({ provider: "manual", method: "card_credit" })).toBe("card_credit");
    expect(inferPaymentMethod({ provider: "manual", method: "card_debit" })).toBe("card_debit");
  });

  it("clasifica importaciones históricas por el metadato de crédito o débito", () => {
    expect(
      inferPaymentMethod({
        provider: "excel_import",
        metadata: { paymentMethod: "credit" },
      })
    ).toBe("card_credit");
    expect(
      inferPaymentMethod({
        provider: "excel_import",
        metadata: { paymentMethod: "debit" },
      })
    ).toBe("card_debit");
  });

  it("no usa el nombre de quien registró el cobro", () => {
    expect(
      getPaymentMethodLabel({
        provider: "manual",
        method: undefined,
      })
    ).toBe("Manual");
  });
});
