/**
 * Envío de facturas por email.
 * Usa la colección 'mail' y la extensión Trigger Email (firestore-send-email).
 */

import * as fs from 'fs';
import type admin from 'firebase-admin';
import { buildEmailHtml, escapeHtml, htmlToPlainText } from '@/lib/email';
import { getSchoolEmailBrand } from '@/lib/email-brand';

const MAIL_COLLECTION = 'mail';

export interface SendInvoiceEmailParams {
  to: string;
  customerName: string;
  invoiceNumber: string;
  amount: string;
  /** Link opcional al PDF (si no hay adjunto). */
  pdfUrl?: string | null;
  /** Ruta local del PDF para adjuntarlo en base64. */
  pdfPath?: string | null;
  /** Nombre del archivo adjunto (default: factura.pdf). */
  pdfFilename?: string | null;
  /** schoolId para branding del correo. */
  schoolId?: string;
  /** Nombre de marca override (si no se usa schoolId). */
  brandName?: string;
  /** Si true, indica en el cuerpo que es una simulación. */
  simulation?: boolean;
}

/**
 * Encola email con factura adjunta (PDF) y/o link de descarga.
 * Formato compatible con firestore-send-email + Nodemailer.
 */
export async function sendInvoiceEmail(
  db: admin.firestore.Firestore,
  params: SendInvoiceEmailParams
): Promise<void> {
  const {
    to,
    customerName,
    invoiceNumber,
    amount,
    pdfUrl,
    pdfPath,
    pdfFilename,
    schoolId,
    brandName: brandOverride,
    simulation,
  } = params;

  const brandFromSchool = schoolId
    ? await getSchoolEmailBrand(db, schoolId)
    : { brandName: 'NauticAdmin', logoUrl: undefined as string | undefined };

  const brandName =
    brandOverride?.trim() || brandFromSchool.brandName || 'NauticAdmin';
  const logoUrl = brandFromSchool.logoUrl;

  const hasAttachment = !!(pdfPath && fs.existsSync(pdfPath));
  const simNote = simulation
    ? '<p><em>Este comprobante es una simulación y no tiene validez fiscal.</em></p>'
    : '';
  const attachmentNote = hasAttachment
    ? '<p>El PDF queda adjunto a este correo.</p>'
    : pdfUrl
      ? ''
      : '<p>Si no ves el adjunto, contactá a la náutica para solicitar una copia.</p>';

  const contentHtml = `
    <p>Hola ${escapeHtml(customerName)},</p>
    <p>Te enviamos la factura Nº ${escapeHtml(invoiceNumber)} por un monto de ${escapeHtml(amount)}.</p>
    ${simNote}
    ${pdfUrl ? `<p><a href="${escapeHtml(pdfUrl)}">Descargar factura (PDF)</a></p>` : ''}
    ${attachmentNote}
    <p>Gracias por tu pago.</p>
  `;

  const subject = `Factura ${invoiceNumber} - ${brandName}`;
  const html = buildEmailHtml(contentHtml, {
    brandName,
    logoUrl,
    title: subject,
    greeting: '',
  });

  const message: Record<string, unknown> = {
    subject,
    html,
    text: htmlToPlainText(contentHtml),
  };

  if (hasAttachment && pdfPath) {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const filename =
      (pdfFilename && pdfFilename.trim()) ||
      `factura-${invoiceNumber.replace(/\s+/g, '-')}.pdf`;
    message.attachments = [
      {
        filename,
        content: pdfBuffer.toString('base64'),
        encoding: 'base64',
        contentType: 'application/pdf',
      },
    ];
  }

  await db.collection(MAIL_COLLECTION).add({
    to,
    message,
  });
}
