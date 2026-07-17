import { collection, addDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import {
  buildEmailHtmlServer,
  brandInitials,
  type EmailBrandOptions,
} from "./email-template-server";

/** Colección que usa la extensión Trigger Email (firestore-send-email). */
export const MAIL_COLLECTION = "mail";

export type { EmailBrandOptions };
export { brandInitials };

/**
 * Genera HTML de correo con branding de la náutica (cabecera + pie).
 * Preferí pasar `brandName` (y `logoUrl` si hay) desde el contexto de la náutica.
 */
export function buildEmailHtml(
  contentHtml: string,
  options?: EmailBrandOptions & { baseUrl?: string }
): string {
  return buildEmailHtmlServer(contentHtml, options);
}

/** Escapa HTML para evitar XSS en contenido controlado (ej. nombre del cliente). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Convierte contenido HTML simple a texto plano (quita tags).
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

export interface MailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Encola un correo creando un documento en la colección mail (Trigger Email).
 */
export async function sendMailDoc(
  firestore: Firestore,
  payload: MailPayload
): Promise<void> {
  const text = payload.text ?? htmlToPlainText(payload.html);
  await addDoc(collection(firestore, MAIL_COLLECTION), {
    to: payload.to,
    message: {
      subject: payload.subject,
      html: payload.html,
      text,
    },
  });
}
