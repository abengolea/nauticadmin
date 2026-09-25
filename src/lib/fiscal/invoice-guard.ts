/**
 * Protección contra doble facturación fiscal real.
 */

export function hasRealFiscalInvoice(pData: Record<string, unknown>): boolean {
  if (pData.facturacionModo === 'real' && pData.facturado === true && pData.CAE) {
    return true;
  }
  if (pData.facturacionModo === 'manual' && pData.facturado === true) {
    return true;
  }
  return false;
}
