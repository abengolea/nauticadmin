/**
 * Helpers de cuenta corriente de proveedores — solo servidor.
 */

import type admin from 'firebase-admin';

type Firestore = admin.firestore.Firestore;

export async function isVendorAccountEnabled(
  db: Firestore,
  schoolId: string,
  vendorId: string
): Promise<boolean> {
  const snap = await db
    .collection('schools')
    .doc(schoolId)
    .collection('expenseVendors')
    .doc(vendorId)
    .get();

  if (snap.exists) {
    const data = snap.data() as { cuentaCorrienteHabilitada?: boolean };
    return data.cuentaCorrienteHabilitada !== false;
  }

  // Proveedor inferido desde facturas (sin catálogo): habilitado por defecto
  return true;
}
