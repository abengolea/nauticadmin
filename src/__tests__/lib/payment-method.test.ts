import { describe, expect, it } from "vitest";
import { getPaymentMethodLabel, inferPaymentMethod } from "../../lib/payments/payment-method";

describe("inferPaymentMethod", () => {
  it("prioriza Mercado Pago y Excel como canal de ingreso", () => {
    expect(inferPaymentMethod({ provider: "mercadopago", method: "card" })).toBe("mercadopago");
    expect(inferPaymentMethod({ provider: "excel_import" })).toBe("excel_import");
  });

  it("usa el medio cargado en cobros manuales", () => {
    expect(inferPaymentMethod({ provider: "manual", method: "cash" })).toBe("cash");
    expect(inferPaymentMethod({ provider: "manual", method: "transfer" })).toBe("transfer");
    expect(inferPaymentMethod({ provider: "manual", method: "cheque" })).toBe("cheque");
    expect(inferPaymentMethod({ provider: "manual", method: "mercadopago" })).toBe("mercadopago");
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
