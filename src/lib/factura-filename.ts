/** Nombre de archivo PDF de factura AFIP, p.ej. factura-B-0006-00018716.pdf */
export function buildFacturaPdfFilename(opts: {
  facturaTipo?: string | null;
  facturaPtoVta?: number | null;
  facturaNumero?: number | null;
}): string | null {
  const pto = opts.facturaPtoVta;
  const nro = opts.facturaNumero;
  if (!pto || !nro) return null;
  const tipo = (opts.facturaTipo ?? '').toUpperCase();
  const letra = /\bC\b/.test(tipo) ? 'C' : /\bA\b/.test(tipo) ? 'A' : 'B';
  return `factura-${letra}-${String(pto).padStart(4, '0')}-${String(nro).padStart(8, '0')}.pdf`;
}

export function formatFacturaLabel(opts: {
  facturaTipo?: string | null;
  facturaPtoVta?: number | null;
  facturaNumero?: number | null;
}): string {
  const pto = opts.facturaPtoVta;
  const nro = opts.facturaNumero;
  if (!pto || !nro) return 'Factura';
  const tipo = (opts.facturaTipo ?? 'FACTURA B').trim() || 'Factura';
  return `${tipo} ${String(pto).padStart(4, '0')}-${String(nro).padStart(8, '0')}`;
}
