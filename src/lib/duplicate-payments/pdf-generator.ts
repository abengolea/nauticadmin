/**
 * Generación de PDF de factura electrónica (con CAE + QR AFIP).
 * Usa generarFacturaPDF cuando hay datos completos de emisor/receptor.
 */

import * as fs from 'fs';
import type { InvoiceOrder, InvoiceOrderAfip } from './types';
import { generarFacturaPDF } from '@/lib/factura-pdf';

export interface GenerateInvoicePdfParams {
  order: InvoiceOrder;
  afip: InvoiceOrderAfip;
  customerName?: string;
  concept: string;
  /** Datos del emisor (opcional, usa env si no se pasa) */
  emisor?: {
    razonSocial: string;
    cuit: string;
    domicilio: string;
    condicionIVA: string;
  };
  /** Datos del receptor (opcional, usa customerName si no se pasa) */
  receptor?: {
    razonSocial: string;
    cuit: string;
    domicilio?: string;
    condicionIVA?: string;
  };
}

/**
 * Genera PDF de la factura con CAE y QR AFIP.
 * Si se pasan emisor y receptor completos, genera PDF real.
 * Sino retorna buffer vacío (comportamiento stub para compatibilidad).
 */
export async function generateInvoicePdf(params: GenerateInvoicePdfParams): Promise<Buffer> {
  const { order, afip, customerName, concept, emisor, receptor } = params;

  if (!receptor?.cuit) {
    console.warn('[pdf-generator] Sin CUIT receptor - no se genera PDF', order.id);
    return Buffer.from('');
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const tipoCbte = afip.cbteTipo === 11 ? 'FACTURA C' : 'FACTURA B';
  const letra = tipoCbte.includes('B') ? 'B' : 'C';

  const pdfPath = await generarFacturaPDF({
    emisor: emisor ?? {
      razonSocial: process.env.AFIP_RAZON_SOCIAL ?? 'NOTIFICAS S. R. L.',
      cuit: process.env.AFIP_CUIT ?? '33-71729868-9',
      domicilio: process.env.AFIP_DOMICILIO ?? 'Av. Corrientes 1234, CABA',
      condicionIVA: 'Responsable Inscripto',
    },
    tipoComprobante: tipoCbte,
    puntoVenta: afip.ptoVta,
    numero: afip.cbteNro,
    fecha,
    receptor: {
      razonSocial: receptor.razonSocial ?? customerName ?? 'Cliente',
      cuit: receptor.cuit,
      domicilio: receptor.domicilio ?? '-',
      condicionIVA: receptor.condicionIVA ?? 'Consumidor Final',
    },
    items: [{ descripcion: concept, cantidad: 1, precioUnitario: order.amount, importe: order.amount }],
    subtotal: order.amount,
    iva21: 0,
    total: order.amount,
    CAE: afip.cae,
    CAEFchVto: afip.caeVto,
    tipoDocReceptor: 80,
  });

  return fs.readFileSync(pdfPath);
}
