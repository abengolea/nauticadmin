/**
 * Rutas Firestore para cuenta corriente de clientes.
 */

export function clientAccountsPath(schoolId: string): string {
  return `schools/${schoolId}/clientAccounts`;
}

export function clientAccountPath(schoolId: string, playerId: string): string {
  return `schools/${schoolId}/clientAccounts/${playerId}`;
}

export function clientAccountEntriesPath(schoolId: string, playerId: string): string {
  return `schools/${schoolId}/clientAccounts/${playerId}/entries`;
}

export function clientAccountEntryPath(
  schoolId: string,
  playerId: string,
  entryId: string
): string {
  return `schools/${schoolId}/clientAccounts/${playerId}/entries/${entryId}`;
}
