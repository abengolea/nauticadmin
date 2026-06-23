/**
 * Factura PDF con layout estructurado estilo AFIP.
 * Genera el PDF desde cero con bordes, divisores y secciones.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';
import type { FacturaPdfDatos } from '@/lib/factura-pdf';
import type { SchoolFacturacion } from '@/lib/school-facturacion';
import { formatCuitDisplay } from '@/lib/school-facturacion';

export interface TemplateFacturaField {
  key: string;
  x: number;
  y: number;
  fontSize: number;
  align: 'left' | 'right' | 'center';
  maxWidth?: number;
}

export interface TemplateFacturaImage {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TemplateFacturaTable {
  x: number;
  y: number;
  w: number;
  h: number;
  headerY?: number;
  rowHeight: number;
  columns: Array<{ key: string; x: number; w: number; align: string }>;
}

export interface TemplateFactura {
  page: { width: number; height: number };
  fields: TemplateFacturaField[];
  images: TemplateFacturaImage[];
  table?: TemplateFacturaTable;
}

const FACTURAS_DIR = path.resolve(process.cwd(), 'facturas');

function facturaLetra(tipoComprobante: string): 'A' | 'B' | 'C' {
  const u = tipoComprobante.toUpperCase();
  if (/\bA\b/.test(u)) return 'A';
  if (/\bC\b/.test(u)) return 'C';
  return 'B';
}

function formatFechaAr(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

function formatMoneyAr(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCantidad(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

/** Carga plantilla y logo desde Firebase Storage */
export async function loadTemplateAssets(
  schoolId: string,
  facturacion: SchoolFacturacion
): Promise<{ modeloPdf?: Buffer; logo?: Buffer }> {
  try {
    const admin = await import('firebase-admin');
    const bucket = admin.storage().bucket();
    const modeloPath =
      (facturacion as unknown as Record<string, string>).modeloFacturaPath ??
      `schools/${schoolId}/factura-modelo.pdf`;

    const logoCandidates = [
      facturacion.logoStoragePath,
      `schools/${schoolId}/logo.png`,
      `schools/${schoolId}/logo.jpg`,
    ].filter(Boolean) as string[];

    const [modeloPdf, logo] = await Promise.all([
      bucket
        .file(modeloPath)
        .download()
        .then(([b]) => b)
        .catch(() => undefined),
      (async () => {
        for (const p of logoCandidates) {
          try {
            const [b] = await bucket.file(p).download();
            return b;
          } catch {
            /* siguiente candidato */
          }
        }
        return undefined;
      })(),
    ]);
    return { modeloPdf, logo };
  } catch {
    return {};
  }
}

export async function generarFacturaConPlantilla(params: {
  datos: FacturaPdfDatos;
  facturacion: SchoolFacturacion;
  template: TemplateFactura;
  logoBytes?: Buffer;
}): Promise<string> {
  const { datos, facturacion, logoBytes } = params;

  const PW = 595, PH = 842; // A4 en puntos
  const ML = 15, MR = 15;
  const CW = PW - ML - MR; // 565

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PW, PH]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Fondo blanco
  page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: rgb(1, 1, 1) });

  const letra = facturaLetra(datos.tipoComprobante);
  const ptoStr = String(datos.puntoVenta).padStart(4, '0');
  const nroStr = String(datos.numero).padStart(8, '0');
  const fechaAr = formatFechaAr(datos.fecha);
  const cuitEmisor = formatCuitDisplay(facturacion.cuit ?? datos.emisor.cuit);
  const condIVA = (facturacion.condicionIVA ?? 'Resp.Inscripto')
    .replace('Responsable Inscripto', 'Resp.Inscripto');
  const tipoDoc = datos.tipoDocReceptor ?? 80;

  // ── Helpers de coordenadas ──────────────────────────────────────────────
  // pdf-lib: y=0 en la BASE de la página, crece hacia arriba.
  // Usamos coordenadas "desde arriba" y convertimos aquí.

  // y para drawRectangle (esquina inferior izquierda)
  const bY = (yTop: number, h: number) => PH - yTop - h;
  // y para líneas
  const lY = (yTop: number) => PH - yTop;
  // y para texto (baseline aproximado)
  const tY = (yTop: number, sz: number) => PH - yTop - sz;

  const hLine = (yTop: number, x1 = ML, x2 = PW - MR) =>
    page.drawLine({
      start: { x: x1, y: lY(yTop) },
      end: { x: x2, y: lY(yTop) },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });

  const vLine = (x: number, yTop1: number, yTop2: number) =>
    page.drawLine({
      start: { x, y: lY(yTop1) },
      end: { x, y: lY(yTop2) },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });

  const box = (x: number, yTop: number, w: number, h: number, gris = false) =>
    page.drawRectangle({
      x,
      y: bY(yTop, h),
      width: w,
      height: h,
      ...(gris ? { color: rgb(0.91, 0.91, 0.91) } : {}),
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
    });

  const txt = (
    text: string, x: number, yTop: number, sz: number,
    f: PDFFont = font, color = rgb(0, 0, 0)
  ) => { if (text) page.drawText(text, { x, y: tY(yTop, sz), size: sz, font: f, color }); };

  const txtR = (
    text: string, xRight: number, yTop: number, sz: number,
    f: PDFFont = font, color = rgb(0, 0, 0)
  ) => {
    if (!text) return;
    const w = f.widthOfTextAtSize(text, sz);
    page.drawText(text, { x: xRight - w, y: tY(yTop, sz), size: sz, font: f, color });
  };

  const fit = (text: string, maxW: number, sz: number, f: PDFFont) => {
    if (!text) return '';
    let s = text;
    while (s.length > 1 && f.widthOfTextAtSize(s, sz) > maxW) s = s.slice(0, -1);
    return s.length < text.length ? s.trimEnd() + '…' : s;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // SIMULACIÓN label (arriba del todo)
  // ══════════════════════════════════════════════════════════════════════════
  if (datos.simulacion) {
    txt('SIMULACIÓN – NO VÁLIDO COMO COMPROBANTE', ML, 8, 8, fontBold, rgb(0.7, 0.2, 0));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 1: ENCABEZADO (y=12..115)
  // ══════════════════════════════════════════════════════════════════════════
  const H_TOP = 12, H_BOT = 115;
  box(ML, H_TOP, CW, H_BOT - H_TOP);

  const LOGO_W = 183; // ancho sección logo
  const LTTR_W = 48;  // ancho sección letra
  const VSEP1 = ML + LOGO_W;    // x = 198
  const VSEP2 = VSEP1 + LTTR_W; // x = 246
  vLine(VSEP1, H_TOP, H_BOT);
  vLine(VSEP2, H_TOP, H_BOT);

  // Logo
  if (logoBytes) {
    try {
      const isPng = logoBytes[0] === 0x89;
      const img = isPng ? await pdfDoc.embedPng(logoBytes) : await pdfDoc.embedJpg(logoBytes);
      const iH = H_BOT - H_TOP - 14;
      const iW = Math.min(LOGO_W - 10, (img.width / img.height) * iH);
      page.drawImage(img, { x: ML + 5, y: bY(H_BOT, 0) + 7, width: iW, height: iH });
    } catch (e) {
      console.warn('[factura] logo embed error:', e);
    }
  }

  // Recuadro interior de la letra (A/B/C)
  const LBX = VSEP1 + 7, LBY = H_TOP + 8;
  const LBW = LTTR_W - 14, LBH = 75;
  box(LBX, LBY, LBW, LBH);

  // Letra centrada en el recuadro
  const letraSz = 26;
  const letraGlyph = fontBold.widthOfTextAtSize(letra, letraSz);
  const boxCenterPdfY = PH - (LBY + LBH / 2);
  page.drawText(letra, {
    x: LBX + LBW / 2 - letraGlyph / 2,
    y: boxCenterPdfY - letraSz * 0.35,
    size: letraSz,
    font: fontBold,
  });

  // Código debajo del recuadro
  const codLabel = letra === 'A' ? 'Cod.01' : letra === 'C' ? 'Cod.11' : 'Cod.06';
  const codW = font.widthOfTextAtSize(codLabel, 6.5);
  txt(codLabel, LBX + LBW / 2 - codW / 2, LBY + LBH + 6, 6.5);

  // Título FACTURA centrado en la sección derecha
  const RC = VSEP2 + (PW - MR - VSEP2) / 2;
  const ftLabel = 'FACTURA';
  const ftNum = `Fact ${letra} ${ptoStr}-${nroStr}`;
  const ftFecha = `Fecha: ${fechaAr}`;
  page.drawText(ftLabel, { x: RC - fontBold.widthOfTextAtSize(ftLabel, 20) / 2, y: tY(H_TOP + 24, 20), size: 20, font: fontBold });
  page.drawText(ftNum, { x: RC - fontBold.widthOfTextAtSize(ftNum, 13) / 2, y: tY(H_TOP + 50, 13), size: 13, font: fontBold });
  page.drawText(ftFecha, { x: RC - font.widthOfTextAtSize(ftFecha, 11) / 2, y: tY(H_TOP + 70, 11), size: 11, font });

  // ══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 2: EMISOR (y=115..200)
  // ══════════════════════════════════════════════════════════════════════════
  const E_TOP = H_BOT, E_BOT = 200;
  hLine(E_BOT);
  const E_VSEP = ML + 280;
  vLine(E_VSEP, E_TOP, E_BOT);

  const maxEL = E_VSEP - ML - 6;
  txt(fit(facturacion.razonSocial ?? datos.emisor.razonSocial, maxEL, 10, fontBold), ML + 3, E_TOP + 14, 10, fontBold);
  txt(fit(facturacion.domicilio ?? datos.emisor.domicilio ?? '', maxEL, 8, font), ML + 3, E_TOP + 27, 8);
  txt(facturacion.telefono ?? '', ML + 3, E_TOP + 38, 8);
  txt(facturacion.email ?? '', ML + 3, E_TOP + 49, 8);

  txt(`Cuit:${cuitEmisor} - ${condIVA}`, E_VSEP + 5, E_TOP + 14, 8);
  txt(`Ing.Brutos: ${facturacion.ingBrutos ?? ''}`, E_VSEP + 5, E_TOP + 27, 8);
  txt(`Inicio Actividades: ${facturacion.inicioActividades ?? ''}`, E_VSEP + 5, E_TOP + 38, 8);
  txt(`(FACTURA ELECTRONICA CAE: ${datos.CAE})`, E_VSEP + 5, E_TOP + 50, 7);

  // ══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 3: CLIENTE (y=200..282, recuadro)
  // ══════════════════════════════════════════════════════════════════════════
  const C_TOP = E_BOT, C_BOT = 282;
  box(ML, C_TOP, CW, C_BOT - C_TOP);
  const C_VSEP = ML + 375;
  vLine(C_VSEP, C_TOP, C_BOT);

  let docStr: string;
  if (tipoDoc === 80) {
    docStr = `Resp.Inscripto - C.U.I.T.: ${formatCuitDisplay(datos.receptor.cuit)}`;
  } else if (tipoDoc === 96) {
    docStr = `Consumidor Final - D.N.I.: ${datos.receptor.cuit}`;
  } else {
    docStr = 'Consumidor Final';
  }

  const clientName = datos.receptor.razonSocial.startsWith('-')
    ? datos.receptor.razonSocial.slice(1)
    : datos.receptor.razonSocial;
  const cliW = C_VSEP - ML - 8;
  txt(fit(clientName, cliW, 9, fontBold), ML + 5, C_TOP + 13, 9, fontBold);
  const dom = datos.receptor.domicilio && datos.receptor.domicilio !== '-' ? datos.receptor.domicilio : '';
  if (dom) txt(fit(dom, cliW, 8, font), ML + 5, C_TOP + 25, 8);
  txt(docStr, ML + 5, C_TOP + (dom ? 37 : 25), 8);

  const RX2 = C_VSEP + 6;
  txt('Conceptos Emitidos:   2:Servicios', RX2, C_TOP + 13, 7.5);
  txt(`Fecha Vencimiento:   ${fechaAr}`, RX2, C_TOP + 24, 7.5);
  txt(`Período Facturado Desde:   ${fechaAr}`, RX2, C_TOP + 35, 7.5);
  txt(`Período Facturado Hasta:   ${fechaAr}`, RX2, C_TOP + 46, 7.5);
  txt(`Op: ${facturacion.operacion ?? ''}`, RX2, C_TOP + 57, 7.5);

  // ══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 4: TABLA DE DETALLE (y=282..710)
  // ══════════════════════════════════════════════════════════════════════════
  const T_TOP = C_BOT, T_BOT = 710;
  const TH_H = 18; // alto encabezado
  const TH_BOT = T_TOP + TH_H;
  const ROW_H = 18;

  // Columnas (x absoluto)
  const C1X = ML,       C1W = 38;
  const C2X = ML + 38,  C2W = 260;
  const C3X = ML + 298, C3W = 68;
  const C4X = ML + 366, C4W = 90;
  const C5X = ML + 456, C5W = PW - MR - (ML + 456);

  // Encabezado de tabla con fondo gris
  box(ML, T_TOP, CW, TH_H, true);

  // tY(yTop, sz): baseline from top = yTop + sz. Para centrar en fila de 18pt
  // con sz=7.5: usar T_TOP+4 → baseline en T_TOP+11.5 (centro visual ~T_TOP+6 a T_TOP+13.2)
  txt('CODIGO', C1X + 2, T_TOP + 4, 7.5, fontBold);
  txt('DETALLE', C2X + 2, T_TOP + 4, 7.5, fontBold);
  txtR('CANTIDAD', C3X + C3W - 2, T_TOP + 4, 7.5, fontBold);
  txtR('PRECIO', C4X + C4W - 2, T_TOP + 4, 7.5, fontBold);
  txtR('SUBTOTAL', C5X + C5W - 2, T_TOP + 4, 7.5, fontBold);

  [C2X, C3X, C4X, C5X].forEach(x => vLine(x, T_TOP, TH_BOT));

  // Filas de datos
  let rowY = TH_BOT;
  for (const item of datos.items) {
    const rowBot = rowY + ROW_H;
    hLine(rowBot, ML, PW - MR);
    [C2X, C3X, C4X, C5X].forEach(x => vLine(x, rowY, rowBot));
    // sz=8 en 18pt: usar rowY+4 → baseline en rowY+12 (texto de rowY+6 a rowY+14)
    txt('06', C1X + 2, rowY + 4, 8);
    txt(fit(item.descripcion, C2W - 4, 8, fontBold), C2X + 2, rowY + 4, 8, fontBold);
    txtR(formatCantidad(item.cantidad), C3X + C3W - 2, rowY + 4, 8);
    txtR(formatMoneyAr(item.precioUnitario), C4X + C4W - 2, rowY + 4, 8);
    txtR(formatMoneyAr(item.importe), C5X + C5W - 2, rowY + 4, 8);
    rowY += ROW_H;
  }

  // Borde exterior de toda la tabla
  box(ML, T_TOP, CW, T_BOT - T_TOP);

  // ══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 5: TOTAL (y=710..732)
  // ══════════════════════════════════════════════════════════════════════════
  const TOT_TOP = T_BOT, TOT_BOT = TOT_TOP + 22;
  box(ML, TOT_TOP, CW, TOT_BOT - TOT_TOP);
  // Baseline alineada: sz=9 usa TOT_TOP+7 → baseline en TOT_TOP+16; sz=14 usa TOT_TOP+2 → idem
  txt('TOTAL $ (Pesos)', ML + 5, TOT_TOP + 7, 9, fontBold);
  txtR(formatMoneyAr(datos.total), PW - MR - 3, TOT_TOP + 2, 14, fontBold);

  // ══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 6: PAGADO (y=732..746)
  // ══════════════════════════════════════════════════════════════════════════
  const PAG_TOP = TOT_BOT, PAG_BOT = PAG_TOP + 14;
  hLine(PAG_BOT);
  if (datos.simulacion) {
    // sz=8 en 14pt: usar PAG_TOP+2 → baseline en PAG_TOP+10 (texto de PAG_TOP+4 a PAG_TOP+12)
    txt('SIMULACIÓN – NO VÁLIDO COMO COMPROBANTE', ML + 5, PAG_TOP + 2, 8, fontBold, rgb(0.7, 0.2, 0));
  } else {
    txt(`Pagado: Total $ ${formatMoneyAr(datos.total)}`, ML + 5, PAG_TOP + 2, 8);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 7: OBSERVACIONES (y=746..760)
  // ══════════════════════════════════════════════════════════════════════════
  const OBS_TOP = PAG_BOT, OBS_BOT = OBS_TOP + 14;
  hLine(OBS_BOT);
  txt('Observaciones:', ML + 5, OBS_TOP + 2, 8, fontBold);

  // ══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 8: PIE DE PÁGINA (y=760..840, recuadro)
  // ══════════════════════════════════════════════════════════════════════════
  const FTR_TOP = OBS_BOT, FTR_BOT = 840;
  box(ML, FTR_TOP, CW, FTR_BOT - FTR_TOP);

  const QR_SIZE = FTR_BOT - FTR_TOP - 12; // ~68
  const QR_X = ML + 5;
  const QR_Y_TOP = FTR_TOP + 6;

  // QR AFIP
  try {
    const cuitENum = datos.emisor.cuit.replace(/\D/g, '');
    const cuitRNum = datos.receptor.cuit.replace(/\D/g, '');
    const tipoCmpMap: Record<'A' | 'B' | 'C', number> = { A: 1, B: 6, C: 11 };
    const qrPayload = {
      ver: 1,
      fecha: datos.fecha,
      cuit: parseInt(cuitENum, 10),
      ptoVta: datos.puntoVenta,
      tipoCmp: tipoCmpMap[letra],
      nroCmp: datos.numero,
      importe: datos.total,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: tipoDoc,
      nroDocRec: parseInt(cuitRNum, 10) || 0,
      tipoCodAut: 'E',
      codAut: /^\d+$/.test(datos.CAE) ? datos.CAE : '0',
    };
    const qrUrl = `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(qrPayload)).toString('base64')}`;
    const qrPng = await QRCode.toBuffer(qrUrl, { width: 120, margin: 0 });
    const qrImg = await pdfDoc.embedPng(qrPng);
    page.drawImage(qrImg, { x: QR_X, y: bY(QR_Y_TOP, QR_SIZE), width: QR_SIZE, height: QR_SIZE });
  } catch {
    console.warn('[factura] QR no generado');
  }

  // "Comprobante Autorizado" centrado entre QR y borde derecho
  const cmptCenterX = (QR_X + QR_SIZE + PW - MR) / 2;
  const cmpL1 = 'Comprobante', cmpL2 = 'Autorizado';
  txt(cmpL1, cmptCenterX - fontBold.widthOfTextAtSize(cmpL1, 7.5) / 2, FTR_TOP + 28, 7.5, fontBold);
  txt(cmpL2, cmptCenterX - fontBold.widthOfTextAtSize(cmpL2, 7.5) / 2, FTR_TOP + 38, 7.5, fontBold);

  // CAE y Vto a la derecha
  txtR(`AFIP CAE: ${datos.CAE}`, PW - MR - 5, FTR_TOP + 28, 7.5, fontBold);
  txtR(`Vto CAE: ${formatFechaAr(datos.CAEFchVto)}`, PW - MR - 5, FTR_TOP + 40, 7.5);

  // ── GUARDAR ──────────────────────────────────────────────────────────────
  if (!fs.existsSync(FACTURAS_DIR)) fs.mkdirSync(FACTURAS_DIR, { recursive: true });
  const filename = `factura-${letra}-${ptoStr}-${nroStr}.pdf`;
  const filepath = path.join(FACTURAS_DIR, filename);
  fs.writeFileSync(filepath, await pdfDoc.save());
  console.log('[factura-template] PDF guardado:', path.resolve(filepath));
  return path.resolve(filepath);
}

export function parseTemplateFactura(raw: unknown): TemplateFactura | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as TemplateFactura;
  if (!Array.isArray(t.fields)) return null;
  return t;
}
