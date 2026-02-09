/** Habilidad/categoría para etiquetar videos de la videoteca. */
export interface VideoSkillOption {
  id: string;
  label: string;
  group: "general" | "goalkeeper";
}

/** Habilidades generales (campo, cualquier posición). */
export const VIDEO_SKILLS_GENERAL: VideoSkillOption[] = [
  { id: "dribling", label: "Dribling", group: "general" },
  { id: "pegada", label: "Pegada", group: "general" },
  { id: "corner", label: "Corner", group: "general" },
  { id: "definicion", label: "Definición", group: "general" },
  { id: "pelotada", label: "Pelotada", group: "general" },
  { id: "parada", label: "Parada", group: "general" },
  { id: "cabezazo", label: "Cabezazo", group: "general" },
  { id: "pase", label: "Pase", group: "general" },
  { id: "control", label: "Control", group: "general" },
  { id: "conduccion", label: "Conducción", group: "general" },
  { id: "marca", label: "Marca", group: "general" },
  { id: "desmarque", label: "Desmarque", group: "general" },
  { id: "vision", label: "Visión de juego", group: "general" },
  { id: "gambeta", label: "Gambeta", group: "general" },
  { id: "tiro_libre", label: "Tiro libre", group: "general" },
  { id: "penales", label: "Penales", group: "general" },
];

/** Habilidades típicas de arquero. */
export const VIDEO_SKILLS_GOALKEEPER: VideoSkillOption[] = [
  { id: "saque_mano", label: "Saque de mano", group: "goalkeeper" },
  { id: "saque_pie", label: "Saque de pie", group: "goalkeeper" },
  { id: "estirada", label: "Estirada", group: "goalkeeper" },
  { id: "salida", label: "Salida", group: "goalkeeper" },
  { id: "blocaje", label: "Blocaje", group: "goalkeeper" },
  { id: "despeje", label: "Despeje", group: "goalkeeper" },
  { id: "posicion_arco", label: "Posición en el arco", group: "goalkeeper" },
  { id: "juego_pies_arco", label: "Juego con los pies (arco)", group: "goalkeeper" },
  { id: "uno_vs_uno", label: "1 vs 1", group: "goalkeeper" },
  { id: "atajada_penal", label: "Atajada de penal", group: "goalkeeper" },
];

export const VIDEO_SKILLS_ALL: VideoSkillOption[] = [
  ...VIDEO_SKILLS_GENERAL,
  ...VIDEO_SKILLS_GOALKEEPER,
];

const labelById = new Map(VIDEO_SKILLS_ALL.map((s) => [s.id, s.label]));

/** Devuelve el label de una habilidad por su id. */
export function getVideoSkillLabel(id: string): string {
  return labelById.get(id) ?? id;
}
