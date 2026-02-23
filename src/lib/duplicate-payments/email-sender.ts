/**
 * Interface para envío de emails (factura por email).
 * Usa la colección 'mail' y extensión Trigger Email existente.
 */

import type admin from 'firebase-admin';
import { buildEmailHtml, escapeHtml } from '@/lib/email';

const MAIL_COLLECTION = 'mail';

export interface SendInvoiceEmailParams {
  to: string;
  customerName: string;
  invoiceNumber: string;
  amount: string;
  pdfUrl?: string | null;
}

/**
 * Encola email con factura adjunta o link al PDF.
 * Usa el formato de la extensión firestore-send-email.
 */
export async function sendInvoiceEmail(
  db: admin.firestore.Firestore,
  params: SendInvoiceEmailParams
): Promise<void> {
  const { to, customerName, invoiceNumber, amount, pdfUrl } = params;

  const contentHtml = `
    <p>Hola ${escapeHtml(customerName)},</p>
    <p>Adjuntamos la factura Nº ${escapeHtml(invoiceNumber)} por un monto de ${escapeHtml(amount)}.</p>
    ${pdfUrl ? `<p><a href="${escapeHtml(pdfUrl)}">Descargar factura (PDF)</a></p>` : ''}
    <p>Gracias por su pago.</p>
  `;

  const html = buildEmailHtml(contentHtml, {
    title: `Factura ${invoiceNumber} - Escuelas River SN`,
    greeting: '',
  });

  const payload: Record<string, unknown> = {
    to,
    message: {
      subject: `Factura ${invoiceNumber} - Escuelas River SN`,
      html,
      text: contentHtml.replace(/<[^>]+>/g, ''),
    },
  };

  await db.collection(MAIL_COLLECTION).add(payload);
}
