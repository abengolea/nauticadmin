/**
 * Generación de PDF de factura electrónica (ARCA).
 * Consume exclusivamente AuthorizedInvoiceData.
 */

import * as fs from 'fs';
import * as path from 'path';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { getFacturasDir } from '@/lib/afip/credentials';
import type { AuthorizedInvoiceData } from '@/lib/fiscal/authorized-invoice';
import { buildAfipQrUrl } from '@/lib/fiscal/qr';
import { CBTE_TIPO } from '@/lib/fiscal/constants';

/** @deprecated Usar AuthorizedInvoiceData */
export interface FacturaPdfEmisor {
  razonSocial: string;
  cuit: string;
  domicilio: string;
  condicionIVA: string;
}

/** @deprecated Usar AuthorizedInvoiceData */
export interface FacturaPdfReceptor {
  razonSocial: string;
  cuit: string;
  domicilio: string;
  condicionIVA: string;
}

/** @deprecated Usar AuthorizedInvoiceData */
export interface FacturaPdfItem {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
}

/** @deprecated Usar AuthorizedInvoiceData */
export interface FacturaPdfDatos {
  emisor: FacturaPdfEmisor;
  tipoComprobante: string;
  puntoVenta: number;
  numero: number;
  fecha: string;
  receptor: FacturaPdfReceptor;
  items: FacturaPdfItem[];
  subtotal: number;
  iva21?: number;
  total: number;
  CAE: string;
  CAEFchVto: string;
  tipoDocReceptor?: number;
  simulacion?: boolean;
}

function facturaLetra(data: AuthorizedInvoiceData): 'A' | 'B' | 'C' {
  if (data.voucherClass === 'M') return 'C';
  return data.voucherClass;
}

function currencyLabel(monedaAfip: string): string {
  return monedaAfip === 'DOL' ? 'USD' : 'ARS';
}

function formatMoney(amount: number, monedaAfip: string): string {
  const curr = currencyLabel(monedaAfip);
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: curr === 'USD' ? 'USD' : 'ARS',
    }).format(amount);
  } catch {
    return `${curr} ${amount}`;
  }
}

function facturasDir(): string {
  return getFacturasDir();
}

function authorizedFromLegacyPdfDatos(datos: FacturaPdfDatos): AuthorizedInvoiceData {
  const letra = datos.tipoComprobante.includes('A')
    ? 'A'
    : datos.tipoComprobante.includes('C')
      ? 'C'
      : 'B';
  const cbteTipo =
    letra === 'A' ? CBTE_TIPO.FACTURA_A : letra === 'C' ? CBTE_TIPO.FACTURA_C : CBTE_TIPO.FACTURA_B;
  return {
    emisorRazonSocial: datos.emisor.razonSocial,
    emisorCuit: datos.emisor.cuit,
    emisorDomicilio: datos.emisor.domicilio,
    emisorCondicionIVA: datos.emisor.condicionIVA,
    cbteTipo,
    tipoComprobanteLabel: datos.tipoComprobante,
    voucherClass: letra,
    puntoVenta: datos.puntoVenta,
    numero: datos.numero,
    fecha: datos.fecha,
    conceptoDescripcion: datos.items[0]?.descripcion ?? 'Servicios',
    receptorRazonSocial: datos.receptor.razonSocial,
    receptorDomicilio: datos.receptor.domicilio,
    condicionIVAReceptorId: 5,
    condicionIVAReceptorLabel: datos.receptor.condicionIVA,
    docTipoReceptor: datos.tipoDocReceptor ?? 80,
    docNroReceptor: parseInt(String(datos.receptor.cuit).replace(/\D/g, ''), 10) || 0,
    docDisplayReceptor: datos.receptor.cuit,
    amounts: {
      impTotal: datos.total,
      impTotConc: 0,
      impNeto: datos.subtotal,
      impOpEx: 0,
      impIva: datos.iva21 ?? 0,
      impTrib: 0,
    },
    monedaAfip: 'PES',
    cotizacionAfip: 1,
    cancelaMismaMonedaExtranjera: false,
    cae: datos.CAE,
    caeFchVto: datos.CAEFchVto,
    afipResultado: datos.simulacion ? 'SIM' : 'A',
    afipObservaciones: [],
    facturacionModo: datos.simulacion ? 'simulacion' : 'real',
    simulacion: !!datos.simulacion,
  };
}

export function authorizedToLegacyPdfDatos(data: AuthorizedInvoiceData): FacturaPdfDatos {
  return {
    emisor: {
      razonSocial: data.emisorRazonSocial,
      cuit: data.emisorCuit,
      domicilio: data.emisorDomicilio,
      condicionIVA: data.emisorCondicionIVA,
    },
    tipoComprobante: data.tipoComprobanteLabel,
    puntoVenta: data.puntoVenta,
    numero: data.numero,
    fecha: data.fecha,
    receptor: {
      razonSocial: data.receptorRazonSocial,
      cuit: data.docDisplayReceptor,
      domicilio: data.receptorDomicilio,
      condicionIVA: data.condicionIVAReceptorLabel,
    },
    items: [
      {
        descripcion: data.conceptoDescripcion,
        cantidad: 1,
        precioUnitario: data.amounts.impNeto,
        importe: data.amounts.impNeto,
      },
    ],
    subtotal: data.amounts.impNeto,
    iva21: data.amounts.impIva > 0 ? data.amounts.impIva : undefined,
    total: data.amounts.impTotal,
    CAE: data.cae,
    CAEFchVto: data.caeFchVto,
    tipoDocReceptor: data.docTipoReceptor,
    simulacion: data.simulacion,
  };
}

export async function generarFacturaPDFFromAuthorized(
  data: AuthorizedInvoiceData
): Promise<string> {
  const outDir = facturasDir();
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const letra = facturaLetra(data);
  const ptoVtaStr = String(data.puntoVenta).padStart(4, '0');
  const nroStr = String(data.numero).padStart(8, '0');
  const filename = `factura-${letra}-${ptoVtaStr}-${nroStr}.pdf`;
  const filepath = path.join(outDir, filename);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = 15;

  if (data.simulacion) {
    doc.setFillColor(255, 240, 200);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 100, 0);
    doc.text('SIMULACIÓN - COMPROBANTE NO VÁLIDO', pageWidth / 2, 10, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(data.emisorRazonSocial, margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`CUIT: ${data.emisorCuit}`, margin, y);
  y += 5;
  doc.text(`Domicilio: ${data.emisorDomicilio}`, margin, y);
  y += 5;
  doc.text(`Cond. IVA: ${data.emisorCondicionIVA}`, margin, y);
  y += 12;

  const letraBoxX = pageWidth - margin - 25;
  doc.rect(letraBoxX, y - 8, 25, 25);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(letra, letraBoxX + 8, y + 6);

  doc.setFontSize(14);
  doc.text(`${data.tipoComprobanteLabel}  ${ptoVtaStr}-${nroStr}`, margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Fecha de emisión: ${data.fecha}`, margin, y);
  y += 15;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Datos del receptor', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Razón social: ${data.receptorRazonSocial}`, margin, y);
  y += 5;
  doc.text(`Documento: ${data.docDisplayReceptor}`, margin, y);
  y += 5;
  doc.text(`Domicilio: ${data.receptorDomicilio}`, margin, y);
  y += 5;
  doc.text(`Cond. IVA: ${data.condicionIVAReceptorLabel}`, margin, y);
  y += 12;

  doc.setFont('helvetica', 'bold');
  doc.text('Detalle', margin, y);
  y += 6;

  const colDesc = margin + 18;
  const colPrecio = pageWidth - margin - 50;
  const colImporte = pageWidth - margin - 25;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Cant.', margin, y);
  doc.text('Descripción', colDesc, y);
  doc.text('P. Unit.', colPrecio, y);
  doc.text('Importe', colImporte, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.text('1', margin, y);
  doc.text(data.conceptoDescripcion.slice(0, 45), colDesc, y);
  doc.text(formatMoney(data.amounts.impNeto, data.monedaAfip), colPrecio, y);
  doc.text(formatMoney(data.amounts.impNeto, data.monedaAfip), colImporte, y);
  y += 10;

  const totalX = pageWidth - margin - 50;
  doc.text('Subtotal:', totalX - 30, y);
  doc.text(formatMoney(data.amounts.impNeto, data.monedaAfip), totalX, y);
  y += 6;

  if (data.amounts.impIva > 0) {
    doc.text('IVA 21%:', totalX - 30, y);
    doc.text(formatMoney(data.amounts.impIva, data.monedaAfip), totalX, y);
    y += 6;
  }

  if (data.monedaAfip !== 'PES') {
    doc.text(`Moneda: ${data.monedaAfip}`, margin, y);
    y += 5;
    doc.text(`Cotización: ${data.cotizacionAfip}`, margin, y);
    y += 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Total:', totalX - 30, y);
  doc.text(formatMoney(data.amounts.impTotal, data.monedaAfip), totalX, y);
  y += 12;

  if (!data.simulacion) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`CAE: ${data.cae}`, margin, y);
    y += 5;
    doc.text(`Vencimiento CAE: ${data.caeFchVto}`, margin, y);
    y += 15;

    const qrUrl = buildAfipQrUrl(data);
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 80,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
    doc.addImage(qrDataUrl, 'PNG', margin, y, 25, 25);
    doc.setFontSize(7);
    doc.text('Código QR para verificación ARCA', margin, y + 30);
  }

  fs.writeFileSync(path.resolve(filepath), Buffer.from(doc.output('arraybuffer')));
  return path.resolve(filepath);
}

/** Compatibilidad legacy */
export async function generarFacturaPDF(datos: FacturaPdfDatos): Promise<string> {
  return generarFacturaPDFFromAuthorized(authorizedFromLegacyPdfDatos(datos));
}

export interface GenerarFacturaOptions {
  authorized?: AuthorizedInvoiceData;
  /** @deprecated Usar authorized */
  datos?: FacturaPdfDatos;
  schoolId?: string;
  facturacion?: import('@/lib/school-facturacion').SchoolFacturacion;
}

export async function generarFactura(opts: GenerarFacturaOptions): Promise<string> {
  const authorized =
    opts.authorized ??
    (opts.datos ? authorizedFromLegacyPdfDatos(opts.datos) : undefined);
  if (!authorized) {
    throw new Error('generarFactura requiere authorized o datos');
  }
  const { schoolId, facturacion } = opts;
  if (facturacion?.templateFactura && schoolId) {
    const { generarFacturaConPlantilla, loadTemplateAssets } = await import(
      '@/lib/factura-pdf-template'
    );
    const assets = await loadTemplateAssets(schoolId, facturacion);
    let logoBytes = assets.logo;
    if (!logoBytes) {
      for (const name of ['logo.png', 'logo.jpg']) {
        const localLogo = path.join(process.cwd(), 'afip/templates', name);
        if (fs.existsSync(localLogo)) {
          logoBytes = fs.readFileSync(localLogo);
          break;
        }
      }
    }
    return generarFacturaConPlantilla({
      authorized,
      facturacion,
      logoBytes,
    });
  }
  return generarFacturaPDFFromAuthorized(authorized);
}
