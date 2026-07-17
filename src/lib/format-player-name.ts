/** Nombre de cliente para UI: apellido primero, luego nombres. */
export function formatPlayerName(
  player: { firstName?: string | null; lastName?: string | null } | null | undefined
): string {
  if (!player) return "";
  const lastName = (player.lastName ?? "").trim();
  const firstName = (player.firstName ?? "").trim();
  return [lastName, firstName].filter(Boolean).join(" ");
}

/** Texto de búsqueda que cubre ambos órdenes (apellido+nombre y nombre+apellido). */
export function playerNameSearchText(
  player: { firstName?: string | null; lastName?: string | null } | null | undefined
): string {
  if (!player) return "";
  const firstName = (player.firstName ?? "").trim().toLowerCase();
  const lastName = (player.lastName ?? "").trim().toLowerCase();
  return `${lastName} ${firstName} ${firstName} ${lastName}`.trim();
}
