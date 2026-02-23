/**
 * Tests unitarios para el matcher (Jaro-Winkler y reconciliación).
 */

import { describe, it, expect } from "vitest";
import { jaroWinkler, buildPayerIndex, reconcileSingle } from "./matcher";
import type { RelationRow } from "./types";

describe("jaroWinkler", () => {
  it("retorna 1 para strings idénticos", () => {
    expect(jaroWinkler("MARIA", "MARIA")).toBe(1);
    expect(jaroWinkler("", "")).toBe(1);
  });

  it("retorna 0 para string vacío vs no vacío", () => {
    expect(jaroWinkler("", "MARIA")).toBe(0);
    expect(jaroWinkler("MARIA", "")).toBe(0);
  });

  it("da mayor score a strings con prefijo común", () => {
    const s1 = jaroWinkler("MARTHA", "MARHTA");
    const s2 = jaroWinkler("MARTHA", "MARTHA");
    expect(s2).toBeGreaterThanOrEqual(s1);
  });

  it("retorna valor entre 0 y 1 para strings similares", () => {
    const sim = jaroWinkler("ROJAS MARIA", "ROJAS MARIA EUGENIA");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThanOrEqual(1);
  });
});

describe("reconcileSingle", () => {
  const relations: RelationRow[] = [
    {
      accountKey: "CUENTA1",
      payerKey: "ROJAS MARIA EUGENIA",
      payerRaw: "Rojas Maria Eugenia",
      accountRaw: "A1-B1",
      createdAt: "",
    },
    {
      accountKey: "CUENTA2",
      payerKey: "MORENO HECTOR",
      payerRaw: "Moreno Hector",
      accountRaw: "A2-B2",
      createdAt: "",
    },
  ];

  const index = buildPayerIndex(relations);

  it("match exacto cuando hay un solo candidato", () => {
    const r = reconcileSingle("Rojas Maria Eugenia", "", index);
    expect(r.status).toBe("MATCHED");
    expect(r.matchedAccountKey).toBe("CUENTA1");
    expect(r.matchType).toBe("exact");
    expect(r.score).toBe(1);
  });

  it("UNMATCHED cuando no hay coincidencia", () => {
    const r = reconcileSingle("DESCONOCIDO XYZ", "", index);
    expect(r.status).toBe("UNMATCHED");
    expect(r.matchedAccountKey).toBeNull();
  });

  it("REVIEW cuando hay múltiples cuentas para el mismo pagador", () => {
    const multiRelations: RelationRow[] = [
      { ...relations[0], accountKey: "C1", accountRaw: "R1" },
      { ...relations[0], accountKey: "C2", accountRaw: "R2" },
    ];
    const idx = buildPayerIndex(multiRelations);
    const r = reconcileSingle("Rojas Maria Eugenia", "", idx);
    expect(r.status).toBe("REVIEW");
    expect(r.candidates.length).toBe(2);
  });
});
