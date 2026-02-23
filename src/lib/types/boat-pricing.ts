/**
 * Tipos de embarcaciones y precios por náutica.
 * Almacenado en schools/{schoolId}/boatPricingConfig/default
 * Todos los precios incluyen IVA.
 */

export interface BoatPricingItem {
  /** ID único para identificar el ítem (ej: nave-cubierta-lanchas-cat1) */
  id: string;
  /** Etiqueta mostrada (ej: "Cat. N°1 (Hasta 4.80mts)") */
  label: string;
  /** Precio mensual en pesos (IVA incluido) */
  price: number;
  /** Grupo al que pertenece (para agrupar en la UI) */
  group: string;
}

/** Configuración de precios de embarcaciones por náutica */
export interface BoatPricingConfig {
  id: string;
  /** Porcentaje global de ajuste aplicado a todos los precios (ej: 10 = +10%) */
  globalAdjustmentPercent?: number;
  /** Ítems de precios por categoría */
  items: BoatPricingItem[];
  updatedAt?: Date;
  updatedBy?: string;
}

/** Precios por defecto según el comunicado de Administración Marinas (enero 2026) */
export const DEFAULT_BOAT_PRICING_ITEMS: Omit<BoatPricingItem, "id">[] = [
  // NAVE CUBIERTA - LANCHAS
  { label: "Cat. N°1 (Hasta 4.80mts)", price: 195000, group: "Nave cubierta - Lanchas" },
  { label: "Cat. N°2 (+ 4.80 / 5.40mts)", price: 252000, group: "Nave cubierta - Lanchas" },
  { label: "Cat. N°3 (+ de 5.40/6.10 mts.)", price: 292000, group: "Nave cubierta - Lanchas" },
  { label: "Cat. N°4 XG (+de 6.10mts. y/o Cuddy)", price: 342500, group: "Nave cubierta - Lanchas" },
  // NAVE CUBIERTA - MOTOS
  { label: "Motos de agua", price: 183500, group: "Nave cubierta - Motos" },
  // NAVE CUBIERTA - CANOBOTES
  { label: "Cat. N°1 (Hasta 6.40mts.)", price: 227000, group: "Nave cubierta - Canobotes/Truckers" },
  { label: "Cat. N°2 Cabinados (Hasta 6.70 mts.)", price: 319500, group: "Nave cubierta - Canobotes/Truckers" },
  // CUNAS EXTERIORES - LANCHAS
  { label: "Cat. N°1 (Hasta 4.80mts)", price: 156800, group: "Cunas exteriores - Lanchas" },
  { label: "Cat. N°2 (+4.80/5.40mts)", price: 204000, group: "Cunas exteriores - Lanchas" },
  { label: "Cat. N°3 (+5.40/6.10mts.)", price: 226500, group: "Cunas exteriores - Lanchas" },
  { label: "Cat. N°4 (+6.10mts.)", price: 0, group: "Cunas exteriores - Lanchas" },
  // CUNAS EXTERIORES - CANOBOTES
  { label: "Cat. N°1 (H/6.40mts)", price: 174000, group: "Cunas exteriores - Canobotes/Truckers" },
  // LAVADO EMBARCACIONES
  { label: "Lanchas", price: 32000, group: "Lavado embarcaciones" },
  { label: "Cabinados", price: 39000, group: "Lavado embarcaciones" },
  { label: "Motos de agua", price: 19500, group: "Lavado embarcaciones" },
  // EMBARCACIONES EN EL AGUA (CALETA) - DESPLAZAMIENTO
  { label: "Cat 1 (Hasta 7 mts.)", price: 210000, group: "En el agua - Desplazamiento 7/11 mts" },
  { label: "Cat 2 (+7mts h/8 mts)", price: 240000, group: "En el agua - Desplazamiento 7/11 mts" },
  { label: "Cat 3 (+8 mts h/9 mts)", price: 264000, group: "En el agua - Desplazamiento 7/11 mts" },
  { label: "Cat 4 (+ 9mts h/11 mts)", price: 288000, group: "En el agua - Desplazamiento 7/11 mts" },
  // EMBARCACIONES EN EL AGUA - PLANEO 6/10
  { label: "Cat 1 (6mts h/7mts.)", price: 274500, group: "En el agua - Planeo 6/10 mts" },
  { label: "Cat 2 (+7mts h/8 mts)", price: 307000, group: "En el agua - Planeo 6/10 mts" },
  { label: "Cat 3 (+8 mts h/9 mts)", price: 334000, group: "En el agua - Planeo 6/10 mts" },
  { label: "Cat 4 (+ 9mts h/10 mts)", price: 369500, group: "En el agua - Planeo 6/10 mts" },
  // EMBARCACIONES EN EL AGUA - PLANEO 10/14
  { label: "Cat 1 (+10 h/11 mts)", price: 418000, group: "En el agua - Planeo 10/14 mts" },
  // SERVICIOS ADICIONALES
  { label: "Guarda bote auxiliar", price: 115000, group: "Servicios adicionales" },
  { label: "Marinería", price: 52000, group: "Servicios adicionales" },
  // KAYAKS
  { label: "Kayaks/Piragüas", price: 52000, group: "Kayaks/Piragüas" },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Grupos que se consideran servicios adicionales (guarda bote auxiliar, marinería, etc.). No incluye lavado ni kayaks. */
export const SERVICIO_GROUPS = [
  "Servicios adicionales",
] as const;

/** Indica si un item es un servicio adicional */
export function isServicioItem(item: { group: string }): boolean {
  return SERVICIO_GROUPS.some((g) => item.group === g);
}

/** Grupos que no se muestran en embarcaciones ni servicios (lavado, etc.) */
export const EXCLUDED_GROUPS = ["Lavado embarcaciones"] as const;

export function isExcludedItem(item: { group: string }): boolean {
  return EXCLUDED_GROUPS.some((g) => item.group === g);
}

/** Construye items con IDs para usar cuando la config de la náutica no existe o está vacía */
export function getDefaultBoatPricingItems(): BoatPricingItem[] {
  return DEFAULT_BOAT_PRICING_ITEMS.map((item, idx) => ({
    ...item,
    id: `${slugify(item.group)}-${slugify(item.label)}-${idx}`,
  }));
}

/** Separa items en embarcaciones (canon) y servicios adicionales. Excluye lavados. */
export function splitPricingItems(items: BoatPricingItem[]) {
  const filtered = items.filter((i) => !isExcludedItem(i));
  const embarcaciones = filtered.filter((i) => !isServicioItem(i));
  const servicios = filtered.filter(isServicioItem);
  return { embarcaciones, servicios };
}
