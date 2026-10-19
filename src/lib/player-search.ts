import { formatPlayerName, playerNameSearchText } from "@/lib/format-player-name";
import { getContactPhones } from "@/lib/contact-phones";
import { normalizeString } from "@/lib/text-normalize";
import { getPlayerEmbarcaciones } from "@/lib/utils";

export type PlayerSearchable = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  dni?: string | null;
  cuit?: string | null;
  ubicacion?: string | null;
  observations?: string | null;
  titularEmbarcacion?: string | null;
  usuarioId?: string | null;
  personasAutorizadas?: string[] | string | null;
  tutorContact?: {
    name?: string | null;
    phone?: string | null;
    phones?: string[] | null;
  } | null;
  embarcaciones?: Array<{
    nombre?: string;
    matricula?: string;
    medidas?: string;
    datos?: string;
  }>;
  embarcacionNombre?: string;
  embarcacionMatricula?: string;
  embarcacionMedidas?: string;
  embarcacionDatos?: string;
};

const SEARCH_PLACEHOLDER =
  "Buscar por nombre, mail, matrícula, embarcación…";

/** Placeholder compartido para inputs de búsqueda de cliente. */
export function playerSearchPlaceholder(): string {
  return SEARCH_PLACEHOLDER;
}

function authorizedNames(player: PlayerSearchable): string[] {
  const raw = player.personasAutorizadas;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw];
  return [];
}

/** Texto plano con todos los campos por los que se puede encontrar un cliente. */
export function playerSearchHaystack(player: PlayerSearchable | null | undefined): string {
  if (!player) return "";
  const embarcaciones = getPlayerEmbarcaciones(player);
  return [
    playerNameSearchText(player),
    formatPlayerName(player),
    player.email,
    player.dni,
    player.cuit,
    player.ubicacion,
    player.observations,
    player.titularEmbarcacion,
    player.usuarioId,
    player.tutorContact?.name,
    ...getContactPhones(player.tutorContact),
    ...authorizedNames(player),
    ...embarcaciones.flatMap((e) => [e.nombre, e.matricula, e.medidas, e.datos]),
  ]
    .filter(Boolean)
    .join(" ");
}

/** True si todos los tokens de la consulta aparecen en algún campo del cliente. */
export function playerMatchesSearch(
  player: PlayerSearchable | null | undefined,
  query: string
): boolean {
  const q = normalizeString(query);
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const haystack = normalizeString(playerSearchHaystack(player));
  return tokens.every((t) => haystack.includes(t));
}
