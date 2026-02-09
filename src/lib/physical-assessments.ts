import type { PhysicalAgeGroup } from "@/lib/types";
import { getAgeInMonths } from "./utils";

/** Rango de meses para cada grupo etario. 5 años = 60 meses, 18 años = 216 meses. */
export const AGE_GROUPS: { group: PhysicalAgeGroup; minMonths: number; maxMonths: number; label: string }[] = [
  { group: "5-8", minMonths: 60, maxMonths: 107, label: "5–8 años" },
  { group: "9-12", minMonths: 108, maxMonths: 155, label: "9–12 años" },
  { group: "13-15", minMonths: 156, maxMonths: 191, label: "13–15 años" },
  { group: "16-18", minMonths: 192, maxMonths: 216, label: "16–18 años" },
];

export function getAgeGroupFromMonths(edadEnMeses: number): PhysicalAgeGroup | null {
  for (const { group, minMonths, maxMonths } of AGE_GROUPS) {
    if (edadEnMeses >= minMonths && edadEnMeses <= maxMonths) return group;
  }
  return null;
}

export function getAgeGroup(birthDate: Date, referenceDate?: Date): PhysicalAgeGroup | null {
  const meses = getAgeInMonths(birthDate, referenceDate);
  return getAgeGroupFromMonths(meses);
}

/** Definición de campos por grupo etario (para formularios dinámicos). */
export type FieldType = "number" | "text";
export type FieldCategory = "velocidad" | "fuerza" | "resistencia" | "coordinacion" | "agilidad" | "flexibilidad" | "observacion";

export interface FieldDef {
  key: string;
  label: string;
  unit?: string;
  type: FieldType;
  min?: number;
  max?: number;
  placeholder?: string;
  category?: FieldCategory;
}

const CAT = {
  v: "velocidad" as FieldCategory,
  f: "fuerza" as FieldCategory,
  r: "resistencia" as FieldCategory,
  c: "coordinacion" as FieldCategory,
  a: "agilidad" as FieldCategory,
  o: "observacion" as FieldCategory,
};

export const FIELDS_BY_AGE_GROUP: Record<PhysicalAgeGroup, FieldDef[]> = {
  "5-8": [
    { key: "sprint_20m_seg", label: "Sprint 20 m", unit: "s", type: "number", min: 3, max: 20, placeholder: "Ej: 5.2", category: CAT.v },
    { key: "salto_horizontal_cm", label: "Salto horizontal", unit: "cm", type: "number", min: 50, max: 250, placeholder: "Ej: 120", category: CAT.f },
    { key: "equilibrio_seg", label: "Equilibrio", unit: "s", type: "number", min: 1, max: 120, placeholder: "Ej: 30", category: CAT.c },
    { key: "circuito_coordinacion_seg", label: "Circuito coordinación", unit: "s", type: "number", min: 10, max: 120, placeholder: "Ej: 45", category: CAT.c },
    { key: "observacion_coordinacion", label: "Observación coordinación", type: "text", placeholder: "Notas sobre coordinación", category: CAT.o },
  ],
  "9-12": [
    { key: "sprint_30m_seg", label: "Sprint 30 m", unit: "s", type: "number", min: 4, max: 25, placeholder: "Ej: 6.5", category: CAT.v },
    { key: "salto_horizontal_cm", label: "Salto horizontal", unit: "cm", type: "number", min: 80, max: 280, placeholder: "Ej: 150", category: CAT.f },
    { key: "salto_vertical_cm", label: "Salto vertical", unit: "cm", type: "number", min: 10, max: 80, placeholder: "Ej: 35", category: CAT.f },
    { key: "test_6min_metros", label: "Test 6 min", unit: "m", type: "number", min: 300, max: 1500, placeholder: "Ej: 900", category: CAT.r },
    { key: "test_agilidad_seg", label: "Test agilidad", unit: "s", type: "number", min: 8, max: 30, placeholder: "Ej: 12", category: CAT.a },
  ],
  "13-15": [
    { key: "sprint_10m_seg", label: "Sprint 10 m", unit: "s", type: "number", min: 1.5, max: 5, placeholder: "Ej: 2.1", category: CAT.v },
    { key: "sprint_30m_seg", label: "Sprint 30 m", unit: "s", type: "number", min: 4, max: 15, placeholder: "Ej: 5.2", category: CAT.v },
    { key: "course_navette_nivel", label: "Course Navette", unit: "nivel", type: "number", min: 1, max: 21, placeholder: "Ej: 8", category: CAT.r },
    { key: "salto_vertical_cm", label: "Salto vertical", unit: "cm", type: "number", min: 15, max: 70, placeholder: "Ej: 40", category: CAT.f },
    { key: "flexiones_1min", label: "Flexiones 1 min", unit: "rep", type: "number", min: 0, max: 60, placeholder: "Ej: 25", category: CAT.f },
  ],
  "16-18": [
    { key: "sprint_10m_seg", label: "Sprint 10 m", unit: "s", type: "number", min: 1.2, max: 4, placeholder: "Ej: 1.8", category: CAT.v },
    { key: "sprint_30m_seg", label: "Sprint 30 m", unit: "s", type: "number", min: 3.5, max: 8, placeholder: "Ej: 4.5", category: CAT.v },
    { key: "sprint_40m_seg", label: "Sprint 40 m", unit: "s", type: "number", min: 4.5, max: 12, placeholder: "Ej: 5.8", category: CAT.v },
    { key: "cooper_metros", label: "Cooper", unit: "m", type: "number", min: 1500, max: 4000, placeholder: "Ej: 2500", category: CAT.r },
    { key: "yo_yo_nivel", label: "Yo-Yo", unit: "nivel", type: "number", min: 1, max: 24, placeholder: "Ej: 14", category: CAT.r },
    { key: "salto_vertical_cm", label: "Salto vertical", unit: "cm", type: "number", min: 20, max: 80, placeholder: "Ej: 45", category: CAT.f },
    { key: "plancha_seg", label: "Plancha abdominal", unit: "s", type: "number", min: 10, max: 300, placeholder: "Ej: 90", category: CAT.f },
    { key: "observacion_asimetrias", label: "Observación asimetrías", type: "text", placeholder: "Notas sobre posibles asimetrías", category: CAT.o },
  ],
};

/** Validación por rango. Devuelve mensaje de error o null si válido. */
export function validateField(field: FieldDef, value: number | string | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (field.type === "text") return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return "Debe ser un número válido.";
  if (field.min != null && num < field.min) return `Mínimo: ${field.min}`;
  if (field.max != null && num > field.max) return `Máximo: ${field.max}`;
  return null;
}

/** Catálogo de todos los campos disponibles (para config). */
export const ALL_FIELDS_CATALOG: Record<string, FieldDef> = {};
for (const group of Object.keys(FIELDS_BY_AGE_GROUP) as PhysicalAgeGroup[]) {
  for (const f of FIELDS_BY_AGE_GROUP[group]) {
    if (!ALL_FIELDS_CATALOG[f.key]) ALL_FIELDS_CATALOG[f.key] = f;
  }
}

/** Config parcial para getFieldsForAgeGroup. */
export interface PhysicalAssessmentConfigPartial {
  enabledFieldsByAgeGroup?: Partial<Record<PhysicalAgeGroup, string[]>>;
  customFieldsByAgeGroup?: Partial<Record<PhysicalAgeGroup, Array<FieldDef & { key: string }>>>;
  fieldOverridesByAgeGroup?: Partial<Record<PhysicalAgeGroup, Record<string, Partial<Pick<FieldDef, "label" | "unit" | "min" | "max" | "placeholder">>>>>;
}

/** Aplica overrides a un FieldDef. */
function applyOverrides(f: FieldDef, overrides?: Partial<Pick<FieldDef, "label" | "unit" | "min" | "max" | "placeholder">>): FieldDef {
  if (!overrides || Object.keys(overrides).length === 0) return f;
  return { ...f, ...overrides };
}

/** Obtiene los campos efectivos para un grupo. Soporta config con enabled, overrides y custom fields. */
export function getFieldsForAgeGroup(
  ageGroup: PhysicalAgeGroup,
  enabledKeysOrConfig?: string[] | null | PhysicalAssessmentConfigPartial
): FieldDef[] {
  const config = typeof enabledKeysOrConfig === "object" && enabledKeysOrConfig !== null && !Array.isArray(enabledKeysOrConfig)
    ? enabledKeysOrConfig
    : undefined;
  const enabledKeys = Array.isArray(enabledKeysOrConfig)
    ? enabledKeysOrConfig
    : config?.enabledFieldsByAgeGroup?.[ageGroup];

  const baseFields = FIELDS_BY_AGE_GROUP[ageGroup];
  const overrides = config?.fieldOverridesByAgeGroup?.[ageGroup] ?? {};
  const customFields = config?.customFieldsByAgeGroup?.[ageGroup] ?? [];

  // Campos base con overrides aplicados
  let baseWithOverrides = baseFields.map((f) => applyOverrides(f, overrides[f.key]));

  // Filtrar por enabled si está definido
  let effectiveBase: FieldDef[];
  if (enabledKeys === undefined || enabledKeys === null) {
    effectiveBase = baseWithOverrides;
  } else if (enabledKeys.length === 0) {
    effectiveBase = [];
  } else {
    effectiveBase = baseWithOverrides.filter((f) => enabledKeys.includes(f.key));
  }

  // Agregar custom fields (siempre habilitados)
  return [...effectiveBase, ...customFields];
}

/** Obtiene el label de un campo. Usa PHYSICAL_FIELD_LABELS por defecto; si hay config con overrides/custom, los aplica. */
export function getFieldLabel(
  key: string,
  ageGroup?: PhysicalAgeGroup | null,
  config?: PhysicalAssessmentConfigPartial | null
): string {
  if (ageGroup && config) {
    const override = config.fieldOverridesByAgeGroup?.[ageGroup]?.[key];
    if (override?.label) return override.label;
    const custom = config.customFieldsByAgeGroup?.[ageGroup]?.find((f) => f.key === key);
    if (custom?.label) return custom.label;
  }
  return PHYSICAL_FIELD_LABELS[key] ?? key;
}

/** Labels para mostrar en gráficos y detalle. */
export const PHYSICAL_FIELD_LABELS: Record<string, string> = {
  sprint_20m_seg: "Sprint 20 m (s)",
  sprint_30m_seg: "Sprint 30 m (s)",
  sprint_10m_seg: "Sprint 10 m (s)",
  sprint_40m_seg: "Sprint 40 m (s)",
  salto_horizontal_cm: "Salto horizontal (cm)",
  salto_vertical_cm: "Salto vertical (cm)",
  equilibrio_seg: "Equilibrio (s)",
  circuito_coordinacion_seg: "Circuito coordinación (s)",
  test_6min_metros: "Test 6 min (m)",
  test_agilidad_seg: "Test agilidad (s)",
  course_navette_nivel: "Course Navette (nivel)",
  flexiones_1min: "Flexiones 1 min",
  cooper_metros: "Cooper (m)",
  yo_yo_nivel: "Yo-Yo (nivel)",
  plancha_seg: "Plancha (s)",
  altura_cm: "Altura (cm)",
  peso_kg: "Peso (kg)",
  imc: "IMC",
};
