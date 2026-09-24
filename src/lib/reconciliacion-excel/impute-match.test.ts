import { describe, expect, it } from "vitest";
import {
  digitsOnly,
  dniFromAccountRaw,
  imputeIdempotencyKey,
  nameFromAccountRaw,
  nameSearchKeys,
  parseAplicadaFlag,
} from "./impute-match";
import { nameVariants, payerNameKeys } from "./player-lookup";

describe("impute-match", () => {
  it("saca solo dígitos del DNI", () => {
    expect(digitsOnly("18.350.968")).toBe("18350968");
    expect(digitsOnly("18350968")).toBe("18350968");
  });

  it("lee nombre e imputación del listado", () => {
    expect(nameFromAccountRaw("ABRAMOR HECTOR E. · DNI 18350968")).toBe("ABRAMOR HECTOR E.");
    expect(dniFromAccountRaw("ABRAMOR HECTOR E. · DNI 18.350.968")).toBe("18350968");
  });

  it("arma claves de búsqueda por nombre", () => {
    const keys = nameSearchKeys("ABRAMOR HECTOR E.");
    expect(keys).toContain("ABRAMOR HECTOR E");
    expect(keys).toContain("HECTOR E ABRAMOR");
  });

  it("interpreta Aplicada", () => {
    expect(parseAplicadaFlag("Si")).toBe(true);
    expect(parseAplicadaFlag("No")).toBe(false);
    expect(parseAplicadaFlag("")).toBeNull();
  });

  it("genera variantes apellido/nombre del pagador Visa", () => {
    expect(nameVariants("ABRAMOR", "HECTOR E.")).toContain("ABRAMOR HECTOR E");
    expect(payerNameKeys("ABRAMOR HECTOR E.")).toContain("ABRAMOR HECTOR E");
  });

  it("genera la misma clave si se imputa dos veces el mismo cobro", () => {
    const a = imputeIdempotencyKey({
      schoolId: "school1",
      sourceKind: "credit",
      payerRaw: "ABRAMOR HECTOR E.",
      amount: 275000,
      cardLast4: "3899",
      paymentRowId: "credit-1",
    });
    const b = imputeIdempotencyKey({
      schoolId: "school1",
      sourceKind: "credit",
      payerRaw: "Abramor Hector E.",
      amount: 275000,
      cardLast4: "3899",
      paymentRowId: "credit-99",
    });
    expect(a).toBe(b);
  });
});
