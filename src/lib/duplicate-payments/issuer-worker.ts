/**
 * IssuerWorker: procesa InvoiceOrders pendientes (emitir AFIP, PDF, email).
 * Ejecutar vía cron o endpoint protegido.
 */

import type admin from 'firebase-admin';
import { COLLECTIONS } from '@/lib/payments/constants';
import { getPendingInvoiceOrders } from './invoice-order';
import { emitAfipComprobante } from './afip-client';
import { generateInvoicePdf } from './pdf-generator';
import { sendInvoiceEmail } from './email-sender';
import type { InvoiceOrder } from './types';

type Firestore = admin.firestore.Firestore;

const MAX_RETRIES = 3;

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  const t = val as { toDate?: () => Date };
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof val === 'string') return new Date(val);
  return new Date();
}

/**
 * Procesa una InvoiceOrder: AFIP -> PDF -> Storage -> Email.
 */
export async function processInvoiceOrder(db: Firestore, order: InvoiceOrder): Promise<void> {
  const admin = await import('firebase-admin');
  const now = admin.firestore.Timestamp.now();
  const orderRef = db.collection(COLLECTIONS.invoiceOrders).doc(order.invoiceKey);

  try {
    await orderRef.update({ status: 'issuing', updatedAt: now });

    // 1) Emitir en AFIP
    const afipResult = await emitAfipComprobante({
      ptoVta: 1, // TODO: config por escuela
      cbteTipo: 1, // Factura B
      concept: order.concept,
      amount: order.amount,
      currency: order.currency,
      customerId: order.customerId,
    });

    await orderRef.update({
      afip: {
        ptoVta: 1,
        cbteTipo: 1,
        cbteNro: afipResult.cbteNro,
        cae: afipResult.cae,
        caeVto: afipResult.caeVto,
      },
      status: 'issued',
      updatedAt: now,
    });

    // 2) Generar PDF
    const pdfBuffer = await generateInvoicePdf({
      order: { ...order, afip: { ptoVta: 1, cbteTipo: 1, cbteNro: afipResult.cbteNro, cae: afipResult.cae, caeVto: afipResult.caeVto } },
      afip: { ptoVta: 1, cbteTipo: 1, cbteNro: afipResult.cbteNro, cae: afipResult.cae, caeVto: afipResult.caeVto },
      concept: order.concept,
    });

    let pdfUrl: string | null = null;
    if (pdfBuffer.length > 0) {
      // TODO: Subir a Firebase Storage y obtener URL
      // const bucket = admin.storage().bucket();
      // const path = `invoices/${order.schoolId}/${order.invoiceKey}.pdf`;
      // await bucket.file(path).save(pdfBuffer, { contentType: 'application/pdf' });
      // pdfUrl = await bucket.file(path).getSignedUrl({ action: 'read', expires: ... });
    }

    await orderRef.update({
      pdfUrl,
      status: 'pdf_ready',
      updatedAt: now,
    });

    // 3) Obtener email del cliente
    const playerRef = db
      .collection('schools')
      .doc(order.schoolId)
      .collection('players')
      .doc(order.customerId);
    const playerSnap = await playerRef.get();
    const playerData = playerSnap.data();
    const toEmail = playerData?.email as string | undefined;
    const customerName = playerData
      ? `${playerData.firstName ?? ''} ${playerData.lastName ?? ''}`.trim()
      : 'Cliente';

    if (toEmail) {
      await sendInvoiceEmail(db, {
        to: toEmail,
        customerName,
        invoiceNumber: `${afipResult.cbteNro}`,
        amount: `${order.currency} ${order.amount.toLocaleString('es-AR')}`,
        pdfUrl,
      });

      await orderRef.update({
        email: {
          to: toEmail,
          sentAt: new Date().toISOString(),
        },
        status: 'email_sent',
        updatedAt: now,
      });
    } else {
      await orderRef.update({
        status: 'pdf_ready',
        updatedAt: now,
      });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const retryCount = (order.retryCount ?? 0) + 1;
    const status = retryCount >= MAX_RETRIES ? 'failed' : 'pending';

    await orderRef.update({
      status,
      failureReason: reason,
      retryCount,
      updatedAt: now,
    });

    throw err;
  }
}

/**
 * Procesa la cola de InvoiceOrders pendientes.
 */
export async function processPendingOrders(
  db: Firestore,
  schoolId?: string,
  limit = 10
): Promise<{ processed: number; failed: number }> {
  const orders = await getPendingInvoiceOrders(db, schoolId, limit);
  let processed = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      await processInvoiceOrder(db, order);
      processed++;
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}
