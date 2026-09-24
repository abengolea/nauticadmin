import { describe, expect, it } from "vitest";
import { fuzzyNameScore, normalizeLegalName, pickFuzzyMatch } from "./name-fuzzy";

describe("name-fuzzy", () => {
  it("corrige typo SERVICIOA y normaliza SA", () => {
    expect(normalizeLegalName("SERVICIOA PORTUARIOS S.A.")).toBe("SERVICIOS PORTUARIOS");
  });

  it("matchea razón social con typo del listado", () => {
    const score = fuzzyNameScore(
      "SERVICIOA PORTUARIOS S.A.",
      "SERVICIOS PORTUARIOS SA"
    );
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it("elige un solo candidato claro", () => {
    const candidates = [
      { id: "a", name: "SERVICIOS PORTUARIOS SA" },
      { id: "b", name: "OTRA EMPRESA SA" },
    ];
    const hit = pickFuzzyMatch(
      "SERVICIOA PORTUARIOS S.A.",
      candidates,
      (t, c) => fuzzyNameScore(t, c.name)
    );
    expect(hit?.id).toBe("a");
  });
});
