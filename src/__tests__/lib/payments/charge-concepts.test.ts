import { describe, expect, it } from "vitest";
import {
  resolveManualCharge,
} from "@/lib/payments/charge-concepts";

describe("resolveManualCharge", () => {
  it("resuelve cuota mensual", () => {
    expect(resolveManualCharge("monthly", "")).toEqual({ kind: "monthly" });
  });

  it("resuelve inscripción", () => {
    expect(resolveManualCharge("registration", "")).toEqual({ kind: "registration" });
  });

  it("resuelve un módulo predefinido", () => {
    expect(resolveManualCharge("Amarra", "")).toEqual({
      kind: "service",
      concept: "Amarra",
    });
  });

  it("pide el campo libre cuando el concepto es Otra", () => {
    expect(resolveManualCharge("other", "  ")).toEqual({
      error: "Completá el concepto de cobro.",
    });
    expect(resolveManualCharge("other", "  Alquiler de kayak  ")).toEqual({
      kind: "service",
      concept: "Alquiler de kayak",
    });
  });
});
