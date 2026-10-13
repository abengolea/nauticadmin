import type { Player } from "@/lib/types";
import type { BoatPricingItem } from "@/lib/types/boat-pricing";
import { getPlayerEmbarcaciones } from "@/lib/utils";

export type ClientMonthlyPricingLine = {
  id: string;
  label: string;
  amount: number;
};

export type ClientMonthlyPricing = {
  total: number;
  lines: ClientMonthlyPricingLine[];
  missing: string[];
};

/** Suma los cánones de todas las embarcaciones y los servicios mensuales del cliente. */
export function calculateClientMonthlyPricing(
  player: Player,
  pricingItems: BoatPricingItem[]
): ClientMonthlyPricing {
  const itemsById = new Map(pricingItems.map((item) => [item.id, item]));
  const lines: ClientMonthlyPricingLine[] = [];
  const missing: string[] = [];

  getPlayerEmbarcaciones(player).forEach((boat, index) => {
    const boatName =
      boat.nombre?.trim() ||
      boat.matricula?.trim() ||
      `Embarcación ${index + 1}`;

    if (!boat.claseId) {
      missing.push(`${boatName}: sin categoría asignada`);
      return;
    }

    const item = itemsById.get(boat.claseId);
    if (!item) {
      missing.push(`${boatName}: categoría sin precio vigente`);
      return;
    }

    lines.push({
      id: `boat-${boat.id}`,
      label: `${boatName} — ${item.label}`,
      amount: item.price,
    });
  });

  (player.serviciosAdicionales ?? []).forEach((service, index) => {
    const item = itemsById.get(service.claseId);
    if (!item) {
      missing.push(`Servicio ${index + 1}: categoría sin precio vigente`);
      return;
    }

    lines.push({
      id: `service-${service.id}`,
      label: item.label,
      amount: item.price,
    });
  });

  if (lines.length === 0 && missing.length === 0) {
    missing.push("El cliente no tiene categorías ni servicios mensuales asignados");
  }

  return {
    total: lines.reduce((sum, line) => sum + line.amount, 0),
    lines,
    missing,
  };
}
