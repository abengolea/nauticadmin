/**
 * POST /api/facturas/emit-batch
 * Emisión fiscal por lote desde pagos aprobados.
 * Manual WSFEv1 v4.8 (Sep 2026).
 */

import * as fs from 'fs';
import * as path from 'path';
import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { verifyIdToken, isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { runWithAfipSession } from '@/lib/afip/session';
import { generarFactura } from '@/lib/factura-pdf';
import {
  loadSchoolFacturacion,
  facturacionToEmisor,
  facturacionToAfipSession,
  getPtoVta,
} from '@/lib/school-facturacion';
import { sendInvoiceEmail } from '@/lib/duplicate-payments/email-sender';
import { COLLECTIONS } from '@/lib/payments/constants';
import { z } from 'zod';
import {
  parseCondicionIvaReceptorId,
  resolveReceptorDocument,
  resolveReceptorDocumentSimulation,
  determineVoucherType,
  parseEmisorCondicionFromConfig,
  reconcileConfiguredCbteTipo,
  emitVoucherFiscal,
  buildAuthorizedInvoiceData,
  buildSimulationAuthorized,
} from '@/lib/fiscal';
import { formatCuitDisplay } from '@/lib/fiscal/cuit';
import { hasRealFiscalInvoice } from '@/lib/fiscal/invoice-guard';

const EmitBatchSchema = z.object({
  schoolId: z.string().min(1),
  paymentIds: z.array(z.string()).min(1).max(50),
  simulation: z.boolean().optional().default(false),
  sendEmail: z.boolean().optional().default(false),
  /** Operación en USD cancelada en la misma moneda extranjera (CanMisMonExt=S) */
  cancelaMismaMonedaExtranjera: z.boolean().optional().default(false),
});

function formatAmountLabel(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'ARS',
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatInvoiceNumber(ptoVta: number, voucherNumber: number): string {
  return `${String(ptoVta).padStart(4, '0')}-${String(voucherNumber).padStart(8, '0')}`;
}

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  const t = val as { toDate?: () => Date };
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof val === 'string') return new Date(val);
  return new Date();
}

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = EmitBatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { schoolId, paymentIds, simulation, sendEmail, cancelaMismaMonedaExtranjera } =
      parsed.data;

    const db = getAdminFirestore();

    const canEmit = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canEmit) {
      return NextResponse.json(
        { error: 'Solo el administrador de la náutica puede emitir facturas' },
        { status: 403 }
      );
    }

    const facturacion = await loadSchoolFacturacion(db, schoolId);
    const afipSession = facturacionToAfipSession(facturacion);
    const emisor = facturacionToEmisor(facturacion);
    const ptoVta = getPtoVta(facturacion);
    const emisorCondicion = parseEmisorCondicionFromConfig(facturacion.condicionIVA);

    const schoolSnap = await db.collection('schools').doc(schoolId).get();
    const schoolData = schoolSnap.exists ? schoolSnap.data() : undefined;
    const schoolName =
      (typeof schoolData?.name === 'string' && schoolData.name.trim()) ||
      emisor.razonSocial;

    const fecha = new Date();
    const fechaStr = fecha.toISOString().slice(0, 10);
    const cbteFch =
      fecha.getFullYear() * 10000 + (fecha.getMonth() + 1) * 100 + fecha.getDate();

    const afipProduction = afipSession.production;

    const results: Array<{
      paymentId: string;
      ok: boolean;
      voucherNumber?: number;
      CAE?: string;
      pdfPath?: string;
      filename?: string;
      error?: string;
      facturacionModo?: string;
      emailSent?: boolean;
      emailTo?: string;
      emailSkippedReason?: string;
      emailError?: string;
    }> = [];

    let simVoucherCounter: number | null = null;

    const paymentsCol = db.collection(COLLECTIONS.payments);

    for (const paymentId of paymentIds) {
      try {
        const paymentSnap = await paymentsCol.doc(paymentId).get();
        if (!paymentSnap.exists) {
          results.push({ paymentId, ok: false, error: 'Pago no encontrado' });
          continue;
        }

        const pData = paymentSnap.data()!;
        if (pData.schoolId !== schoolId) {
          results.push({ paymentId, ok: false, error: 'Pago no pertenece a esta náutica' });
          continue;
        }
        if (pData.status !== 'approved') {
          results.push({ paymentId, ok: false, error: 'Solo se pueden facturar pagos aprobados' });
          continue;
        }

        if (hasRealFiscalInvoice(pData)) {
          results.push({
            paymentId,
            ok: false,
            error: `Este pago ya tiene factura fiscal autorizada (CAE: ${pData.CAE ?? 'manual'})`,
          });
          continue;
        }

        const playerId = pData.playerId as string;
        const amount = Number(pData.amount) ?? 0;
        const period = pData.period as string;
        const currency = (pData.currency as string) ?? 'ARS';

        const playerSnap = await db
          .collection('schools')
          .doc(schoolId)
          .collection('players')
          .doc(playerId)
          .get();

        const playerData = playerSnap.exists ? playerSnap.data() : null;
        const playerName = playerData
          ? `${playerData.firstName ?? ''} ${playerData.lastName ?? ''}`.trim() || 'Cliente'
          : 'Cliente';

        if (playerData?.requiereFactura === false) {
          results.push({
            paymentId,
            ok: false,
            error: `${playerName} está marcado como no facturar`,
          });
          continue;
        }

        const condicionIvaId = parseCondicionIvaReceptorId(
          playerData?.condicionIVAId,
          playerData?.condicionIVA
        );
        if (condicionIvaId == null) {
          results.push({
            paymentId,
            ok: false,
            error: `${playerName}: condición IVA del cliente inválida o faltante. Completá el perfil fiscal.`,
          });
          continue;
        }

        const voucherDetermined = determineVoucherType({
          emisorCondicion,
          receptorCondicionId: condicionIvaId,
        });
        if ('error' in voucherDetermined) {
          results.push({ paymentId, ok: false, error: voucherDetermined.error });
          continue;
        }

        const cbteReconcile = reconcileConfiguredCbteTipo(
          voucherDetermined.cbteTipo,
          facturacion.cbteTipo
        );
        if (cbteReconcile.warning) {
          console.info('[emit-batch]', paymentId, cbteReconcile.warning);
        }
        const cbteTipo = cbteReconcile.cbteTipo;
        const cbteTipoLabel = voucherDetermined.label;

        const metadata = (pData.metadata ?? {}) as { concept?: string };
        const conceptoDescripcion =
          period === 'inscripcion'
            ? 'Derecho de inscripción'
            : period.startsWith('ropa-')
              ? `Cuota de indumentaria (${period})`
              : period.startsWith('extra-') && metadata.concept
                ? metadata.concept
                : `Cuota ${period}`;

        if (simulation) {
          const receptorDoc = resolveReceptorDocumentSimulation(playerData ?? null);
          if (simVoucherCounter == null) simVoucherCounter = 900000;
          const voucherNumber = simVoucherCounter++;
          const authorized = buildSimulationAuthorized({
            emisor: {
              razonSocial: emisor.razonSocial,
              cuit: emisor.cuit,
              domicilio: emisor.domicilio,
              condicionIVA: emisor.condicionIVA,
            },
            receptor: { razonSocial: playerName, domicilio: '-' },
            receptorDoc,
            condicionIVAReceptorId: condicionIvaId,
            cbteTipo,
            tipoComprobanteLabel: cbteTipoLabel,
            ptoVta,
            numero: voucherNumber,
            fecha: fechaStr,
            conceptoDescripcion,
            totalAmount: amount,
            currency,
          });

          const pdfPath = await generarFactura({ authorized, schoolId, facturacion });
          const filename = path.basename(pdfPath);

          let facturaSimulacionStoragePath: string | undefined;
          try {
            facturaSimulacionStoragePath = `schools/${schoolId}/payments/${paymentId}/${filename}`;
            await getAdminStorage()
              .bucket()
              .file(facturaSimulacionStoragePath)
              .save(fs.readFileSync(pdfPath), {
                metadata: { contentType: 'application/pdf' },
              });
          } catch {
            facturaSimulacionStoragePath = undefined;
          }

          await paymentsCol.doc(paymentId).update({
            facturacionModo: 'simulacion',
            facturacionSimulacionAt: new Date(),
            facturaSimulacionStoragePath: facturaSimulacionStoragePath ?? null,
            facturaSimulacionNumero: voucherNumber,
            facturaSimulacionPtoVta: ptoVta,
            facturaSimulacionTipo: cbteTipoLabel,
          });

          results.push({
            paymentId,
            ok: true,
            voucherNumber,
            pdfPath,
            filename,
            facturacionModo: 'simulacion',
          });
          continue;
        }

        const receptorResolved = resolveReceptorDocument(playerData ?? null, condicionIvaId, {
          emisorCuit: facturacion.cuit,
        });
        if ('code' in receptorResolved) {
          results.push({
            paymentId,
            ok: false,
            error: `${playerName}: ${receptorResolved.message}`,
          });
          continue;
        }

        const emitOutput = await runWithAfipSession(afipSession, () =>
          emitVoucherFiscal({
            db,
            lockOwnerId: `${paymentId}-${Date.now()}`,
            cuitEmisor: facturacion.cuit.replace(/\D/g, ''),
            ptoVta,
            cbteTipo,
            concepto: 2,
            cbteFch,
            fechaIso: fechaStr,
            docTipo: receptorResolved.docTipo,
            docNro: receptorResolved.docNro,
            docDisplay: receptorResolved.docDisplay,
            condicionIVAReceptorId: condicionIvaId,
            paymentCurrency: currency,
            cancelaMismaMonedaExtranjera:
              currency.toUpperCase() === 'USD' && cancelaMismaMonedaExtranjera,
            totalAmount: amount,
            pendingVoucherNumber:
              typeof pData.fiscalPendingVoucherNumber === 'number'
                ? pData.fiscalPendingVoucherNumber
                : undefined,
            paymentRef: paymentsCol.doc(paymentId),
          })
        );

        const authorized = buildAuthorizedInvoiceData({
          input: {
            db,
            lockOwnerId: paymentId,
            cuitEmisor: facturacion.cuit,
            ptoVta,
            cbteTipo,
            concepto: 2,
            cbteFch,
            fechaIso: fechaStr,
            docTipo: receptorResolved.docTipo,
            docNro: receptorResolved.docNro,
            docDisplay: receptorResolved.docDisplay,
            condicionIVAReceptorId: condicionIvaId,
            paymentCurrency: currency,
            cancelaMismaMonedaExtranjera:
              currency.toUpperCase() === 'USD' && cancelaMismaMonedaExtranjera,
            totalAmount: amount,
          },
          output: emitOutput,
          emisor: {
            razonSocial: emisor.razonSocial,
            cuit: formatCuitDisplay(facturacion.cuit),
            domicilio: emisor.domicilio,
            condicionIVA: emisor.condicionIVA,
          },
          receptor: { razonSocial: playerName, domicilio: '-' },
          tipoComprobanteLabel: cbteTipoLabel,
          conceptoDescripcion,
          facturacionModo: 'real',
        });

        const pdfPath = await generarFactura({ authorized, schoolId, facturacion });
        const filename = path.basename(pdfPath);
        const now = new Date();

        let facturaStoragePath: string | undefined;
        try {
          facturaStoragePath = `schools/${schoolId}/payments/${paymentId}/${filename}`;
          await getAdminStorage()
            .bucket()
            .file(facturaStoragePath)
            .save(fs.readFileSync(pdfPath), {
              metadata: { contentType: 'application/pdf' },
            });
        } catch (storageErr) {
          console.error('[emit-batch] Storage upload failed', paymentId, storageErr);
        }

        const invoiceNumber = formatInvoiceNumber(ptoVta, emitOutput.voucherNumber);
        const amountLabel = formatAmountLabel(amount, currency);

        let emailSent = false;
        let emailTo: string | undefined;
        let emailSkippedReason: string | undefined;
        let emailError: string | undefined;

        if (sendEmail) {
          const rawEmail =
            typeof playerData?.email === 'string' ? playerData.email.trim() : '';
          if (!rawEmail || !rawEmail.includes('@')) {
            emailSkippedReason = `${playerName} no tiene email cargado`;
          } else {
            emailTo = rawEmail;
            try {
              await sendInvoiceEmail(db, {
                to: rawEmail,
                customerName: playerName,
                invoiceNumber,
                amount: amountLabel,
                pdfPath,
                pdfFilename: filename,
                brandName: schoolName,
                simulation: false,
              });
              emailSent = true;
            } catch (mailErr) {
              emailError = mailErr instanceof Error ? mailErr.message : String(mailErr);
            }
          }
        }

        await paymentsCol.doc(paymentId).update({
          facturado: true,
          facturadoAt: now,
          facturacionModo: 'real',
          facturaNumero: emitOutput.voucherNumber,
          facturaPtoVta: ptoVta,
          facturaFecha: fechaStr,
          facturaTipo: cbteTipoLabel,
          CAE: emitOutput.authorized.cae,
          CAEFchVto: emitOutput.authorized.caeFchVto,
          condicionIVAReceptorId: condicionIvaId,
          docTipoReceptor: receptorResolved.docTipo,
          docNroReceptor: receptorResolved.docNro,
          monedaAfip: emitOutput.authorized.monedaAfip,
          cotizacionAfip: emitOutput.authorized.cotizacionAfip,
          cotizacionFecha: emitOutput.authorized.cotizacionFecha ?? null,
          cancelaMismaMonedaExtranjera: emitOutput.authorized.cancelaMismaMonedaExtranjera,
          afipResultado: emitOutput.authorized.afipResultado,
          afipObservaciones: emitOutput.authorized.afipObservaciones,
          afipErrores: emitOutput.audit.afipErrores ?? [],
          emitidoAt: now,
          emitidoPorUid: auth.uid,
          afipProduction,
          cbteTipo,
          ...(emitOutput.audit.afipRequestSanitized
            ? { afipRequestSanitized: emitOutput.audit.afipRequestSanitized }
            : {}),
          ...(emitOutput.audit.afipResponseSanitized
            ? { afipResponseSanitized: emitOutput.audit.afipResponseSanitized }
            : {}),
          ...(facturaStoragePath ? { facturaStoragePath } : {}),
          fiscalPendingVoucherNumber: null,
          ...(sendEmail
            ? {
                facturaEmailRequested: true,
                facturaEmailSent: emailSent,
                ...(emailSent && emailTo ? { facturaEmailTo: emailTo, facturaEmailSentAt: now } : {}),
                ...(emailSkippedReason ? { facturaEmailSkipReason: emailSkippedReason } : {}),
                ...(emailError ? { facturaEmailError: emailError } : {}),
              }
            : {}),
        });

        results.push({
          paymentId,
          ok: true,
          voucherNumber: emitOutput.voucherNumber,
          CAE: emitOutput.authorized.cae,
          pdfPath,
          filename,
          facturacionModo: 'real',
          ...(sendEmail ? { emailSent, emailTo, emailSkippedReason, emailError } : {}),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[emit-batch] Error facturando', paymentId, err);
        results.push({ paymentId, ok: false, error: msg });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok).length;

    return NextResponse.json({
      ok: true,
      simulation,
      afipProduction,
      sendEmail,
      emisor: { razonSocial: emisor.razonSocial, cuit: emisor.cuit, ptoVta },
      total: results.length,
      processed: okCount,
      failed: failCount,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/facturas/emit-batch]', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
