/**
 * Generación de PDF de factura electrónica (AFIP).
 * Diseño estándar argentino con CAE y QR obligatorio.
 */

import * as fs from 'fs';
import * as path from 'path';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export interface FacturaPdfEmisor {
  razonSocial: string;
  cuit: string;
  domicilio: string;
  condicionIVA: string;
}

export interface FacturaPdfReceptor {
  razonSocial: string;
  cuit: string;
  domicilio: string;
  condicionIVA: string;
}

export interface FacturaPdfItem {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
}

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
  /** Tipo documento receptor: 80=CUIT, 96=DNI */
  tipoDocReceptor?: number;
  /** Si true, agrega marca "SIMULACIÓN - NO VÁLIDO" al PDF */
  simulacion?: boolean;
}

const FACTURAS_DIR = path.resolve(process.cwd(), 'facturas');

/**
 * Construye la URL del QR AFIP según especificación.
 * https://www.afip.gob.ar/fe/qr/?p= + base64(JSON)
 */
function buildAfipQrUrl(datos: FacturaPdfDatos): string {
  const cuitEmisor = datos.emisor.cuit.replace(/\D/g, '');
  const cuitReceptor = datos.receptor.cuit.replace(/\D/g, '');
  const tipoDocRec = datos.tipoDocReceptor ?? 80;

  const qrData = {
    ver: 1,
    fecha: datos.fecha,
    cuit: parseInt(cuitEmisor, 10),
    ptoVta: datos.puntoVenta,
    tipoCmp: datos.tipoComprobante.includes('B') ? 6 : datos.tipoComprobante.includes('C') ? 11 : 6,
    nroCmp: datos.numero,
    importe: datos.total,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec,
    nroDocRec: parseInt(cuitReceptor, 10),
    tipoCodAut: 'E',
    codAut: datos.CAE,
  };

  const jsonStr = JSON.stringify(qrData);
  const base64 = Buffer.from(jsonStr, 'utf-8').toString('base64');
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}

/**
 * Genera el PDF de la factura y lo guarda en ./facturas/
 * Retorna la ruta absoluta del archivo.
 */
export async function generarFacturaPDF(datos: FacturaPdfDatos): Promise<string> {
  if (!fs.existsSync(FACTURAS_DIR)) {
    fs.mkdirSync(FACTURAS_DIR, { recursive: true });
  }

  const letra = datos.tipoComprobante.includes('B') ? 'B' : datos.tipoComprobante.includes('C') ? 'C' : 'B';
  const ptoVtaStr = String(datos.puntoVenta).padStart(4, '0');
  const nroStr = String(datos.numero).padStart(8, '0');
  const filename = `factura-${letra}-${ptoVtaStr}-${nroStr}.pdf`;
  const filepath = path.join(FACTURAS_DIR, filename);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = 15;

  if (datos.simulacion) {
    doc.setFillColor(255, 240, 200);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 100, 0);
    doc.text('SIMULACIÓN - COMPROBANTE NO VÁLIDO', pageWidth / 2, 10, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  // --- EMISOR ---
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(datos.emisor.razonSocial, margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`CUIT: ${datos.emisor.cuit}`, margin, y);
  y += 5;
  doc.text(`Domicilio: ${datos.emisor.domicilio}`, margin, y);
  y += 5;
  doc.text(`Cond. IVA: ${datos.emisor.condicionIVA}`, margin, y);
  y += 12;

  // --- TIPO Y NÚMERO (recuadro con letra B grande) ---
  const letraBoxX = pageWidth - margin - 25;
  doc.setDrawColor(0, 0, 0);
  doc.rect(letraBoxX, y - 8, 25, 25);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(letra, letraBoxX + 8, y + 6);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`${datos.tipoComprobante}  ${ptoVtaStr}-${nroStr}`, margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Fecha de emisión: ${datos.fecha}`, margin, y);
  y += 15;

  // --- RECEPTOR ---
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Datos del receptor', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Razón social: ${datos.receptor.razonSocial}`, margin, y);
  y += 5;
  doc.text(`CUIT: ${datos.receptor.cuit}`, margin, y);
  y += 5;
  doc.text(`Domicilio: ${datos.receptor.domicilio}`, margin, y);
  y += 5;
  doc.text(`Cond. IVA: ${datos.receptor.condicionIVA}`, margin, y);
  y += 12;

  // --- DETALLE DE ÍTEMS ---
  doc.setFont('helvetica', 'bold');
  doc.text('Detalle', margin, y);
  y += 6;

  const colCant = margin;
  const colDesc = margin + 18;
  const colPrecio = pageWidth - margin - 50;
  const colImporte = pageWidth - margin - 25;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Cant.', colCant, y);
  doc.text('Descripción', colDesc, y);
  doc.text('P. Unit.', colPrecio, y);
  doc.text('Importe', colImporte, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  for (const item of datos.items) {
    doc.text(String(item.cantidad), colCant, y);
    doc.text(item.descripcion.slice(0, 45) + (item.descripcion.length > 45 ? '...' : ''), colDesc, y);
    doc.text(`$ ${item.precioUnitario.toLocaleString('es-AR')}`, colPrecio, y);
    doc.text(`$ ${item.importe.toLocaleString('es-AR')}`, colImporte, y);
    y += 5;
  }
  y += 5;

  // --- TOTALES ---
  const totalX = pageWidth - margin - 50;
  doc.setFont('helvetica', 'normal');
  doc.text(`Subtotal:`, totalX - 30, y);
  doc.text(`$ ${datos.subtotal.toLocaleString('es-AR')}`, totalX, y);
  y += 6;
  if (datos.iva21 != null && datos.iva21 > 0) {
    doc.text(`IVA 21%:`, totalX - 30, y);
    doc.text(`$ ${datos.iva21.toLocaleString('es-AR')}`, totalX, y);
    y += 6;
  }
  doc.setFont('helvetica', 'bold');
  doc.text(`Total:`, totalX - 30, y);
  doc.text(`$ ${datos.total.toLocaleString('es-AR')}`, totalX, y);
  y += 12;

  // --- CAE ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`CAE: ${datos.CAE}`, margin, y);
  y += 5;
  doc.text(`Vencimiento CAE: ${datos.CAEFchVto}`, margin, y);
  y += 15;

  // --- QR AFIP ---
  const qrUrl = buildAfipQrUrl(datos);
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 80,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });

  doc.addImage(qrDataUrl, 'PNG', margin, y, 25, 25);
  doc.setFontSize(7);
  doc.text('Código QR para verificación AFIP', margin, y + 30);

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  const absolutePath = path.resolve(filepath);
  fs.writeFileSync(absolutePath, pdfBuffer);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`No se pudo guardar el PDF en ${absolutePath}`);
  }
  console.log('[factura-pdf] PDF guardado:', absolutePath);
  return absolutePath;
}
