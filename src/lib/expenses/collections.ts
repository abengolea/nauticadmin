/**
 * Rutas de colecciones Firestore para el módulo de Gastos.
 * Usamos schoolId como tenant.
 */

export function expensesPath(schoolId: string): string {
  return `schools/${schoolId}/expenses`;
}

export function expensePath(schoolId: string, expenseId: string): string {
  return `schools/${schoolId}/expenses/${expenseId}`;
}

export function expenseVendorsPath(schoolId: string): string {
  return `schools/${schoolId}/expenseVendors`;
}

export function expenseVendorPath(schoolId: string, vendorId: string): string {
  return `schools/${schoolId}/expenseVendors/${vendorId}`;
}

export function vendorAccountsPath(schoolId: string): string {
  return `schools/${schoolId}/vendorAccounts`;
}

export function vendorAccountPath(schoolId: string, vendorId: string): string {
  return `schools/${schoolId}/vendorAccounts/${vendorId}`;
}

export function vendorAccountEntriesPath(schoolId: string, vendorId: string): string {
  return `schools/${schoolId}/vendorAccounts/${vendorId}/entries`;
}

export function vendorAccountEntryPath(
  schoolId: string,
  vendorId: string,
  entryId: string
): string {
  return `schools/${schoolId}/vendorAccounts/${vendorId}/entries/${entryId}`;
}

export function expensePaymentsPath(schoolId: string): string {
  return `schools/${schoolId}/expensePayments`;
}

export function expensePaymentPath(schoolId: string, paymentId: string): string {
  return `schools/${schoolId}/expensePayments/${paymentId}`;
}
