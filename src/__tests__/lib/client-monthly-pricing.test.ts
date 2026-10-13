import { describe, expect, it } from "vitest";
import { calculateClientMonthlyPricing } from "../../lib/payments/client-monthly-pricing";
import type { Player } from "../../lib/types";

describe("calculateClientMonthlyPricing", () => {
  it("suma todas las embarcaciones y servicios mensuales", () => {
    const player = {
      id: "player-1",
      embarcaciones: [
        { id: "boat-1", nombre: "Luna", claseId: "cat-1" },
        { id: "boat-2", matricula: "REY-2", claseId: "cat-2" },
      ],
      serviciosAdicionales: [{ id: "service-1", claseId: "service-1" }],
    } as Player;

    const result = calculateClientMonthlyPricing(player, [
      { id: "cat-1", label: "Categoría 1", price: 100, group: "Cunas" },
      { id: "cat-2", label: "Categoría 2", price: 200, group: "Cunas" },
      { id: "service-1", label: "Marinería", price: 50, group: "Servicios adicionales" },
    ]);

    expect(result.total).toBe(350);
    expect(result.lines).toHaveLength(3);
    expect(result.missing).toEqual([]);
  });

  it("informa categorías faltantes sin impedir calcular las asignadas", () => {
    const player = {
      id: "player-2",
      embarcaciones: [
        { id: "boat-1", nombre: "Con precio", claseId: "cat-1" },
        { id: "boat-2", nombre: "Sin categoría" },
      ],
    } as Player;

    const result = calculateClientMonthlyPricing(player, [
      { id: "cat-1", label: "Categoría 1", price: 100, group: "Cunas" },
    ]);

    expect(result.total).toBe(100);
    expect(result.missing).toEqual(["Sin categoría: sin categoría asignada"]);
  });
});
