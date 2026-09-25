/**
 * POST /api/facturas/emit-batch
 * Emite facturas para los pagos seleccionados.
 * Modo simulación: no llama AFIP, genera PDF con marca "SIMULACIÓN".
 * Modo real: emite a AFIP homologación/producción según config.
 */

import * as fs from 'fs';
import * as path from 'path';
import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { createNextVoucher } from '@/lib/afip/wsfe';
import { runWithAfipSession } from '@/lib/afip/session';
import { generarFactura } from '@/lib/factura-pdf';
import {
  loadSchoolFacturacion,
  facturacionToEmisor,
  facturacionToAfipSession,
  getPtoVta,
  getCbteTipo,
} from '@/lib/school-facturacion';
import { sendInvoiceEmail } from '@/lib/duplicate-payments/email-sender';
import { COLLECTIONS } from '@/lib/payments/constants';
import { z } from 'zod';

const EmitBatchSchema = z.object({
  schoolId: z.string().min(1),
  paymentIds: z.array(z.string()).min(1).max(50),
  /** true = no emite a AFIP, solo genera PDF simulado */
  simulation: z.boolean().optional().default(true),
  /** true = encolar email al cliente con el PDF adjunto (si tiene email) */
  sendEmail: z.boolean().optional().default(false),
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

/** Mapea condicionIVA del cliente a CondIVAReceptor AFIP (RG 5616). 5=Consumidor Final, 1=RI, 6=Monotributo */
function condicionIVAtoAfipId(condicionIVA: string | undefined): number {
  const v = (condicionIVA ?? '').trim();
  if (v === 'Responsable Inscripto') return 1;
  if (v === 'Monotributista') return 6;
  return 5; // Consumidor Final por defecto
}

/** Pseudo-CUIT 20-DNI-0 no es CUIT real en AFIP; va como DocTipo 96 (DNI). */
function isPseudoCuitFromDni(digits: string): boolean {
  return /^20\d{8}0$/.test(digits);
}

function resolveReceptorDocument(
  playerData: { cuit?: string; dni?: string } | null,
  simulation: boolean
):
  | { docDisplay: string; docTipo: number; docNro: number }
  | { error: 'missing' | 'invalid' } {
  const cuitDigits = String(playerData?.cuit ?? '').replace(/\D/g, '');
  const dniDigits = String(playerData?.dni ?? '').replace(/\D/g, '');

  if (cuitDigits.length === 11 && !isPseudoCuitFromDni(cuitDigits)) {
    return {
      docDisplay: String(playerData?.cuit ?? cuitDigits),
      docTipo: 80,
      docNro: parseInt(cuitDigits, 10),
    };
  }

  if (dniDigits.length === 8) {
    return {
      docDisplay: simulation ? '20-00000000-0' : `20-${dniDigits}-0`,
      docTipo: 96,
      docNro: parseInt(dniDigits, 10),
    };
  }

  if (cuitDigits.length === 11 && isPseudoCuitFromDni(cuitDigits)) {
    const dniFromPseudo = cuitDigits.slice(2, 10);
    return {
      docDisplay: String(playerData?.cuit ?? `20-${dniFromPseudo}-0`),
      docTipo: 96,
      docNro: parseInt(dniFromPseudo, 10),
    };
  }

  if (simulation) {
    return { docDisplay: '20-00000000-0', docTipo: 96, docNro: 0 };
  }

  if (cuitDigits.length > 0 || dniDigits.length > 0) {
    return { error: 'invalid' };
  }

  return { error: 'missing' };
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

    const { schoolId, paymentIds, simulation, sendEmail } = parsed.data;

    const db = getAdminFirestore();

    const facturacion = await loadSchoolFacturacion(db, schoolId);
    const afipSession = facturacionToAfipSession(facturacion);
    const emisor = facturacionToEmisor(facturacion);
    const ptoVta = getPtoVta(facturacion);
    const cbteTipo = getCbteTipo(facturacion);

    // Verificar acceso a la náutica
    const schoolSnap = await db.collection('schools').doc(schoolId).get();
    const schoolUserSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('users')
      .doc(auth.uid)
      .get();
    if (!schoolUserSnap.exists) {
      return NextResponse.json({ error: 'Sin acceso a esta náutica' }, { status: 403 });
    }

    const schoolData = schoolSnap.exists ? schoolSnap.data() : undefined;
    const schoolName =
      (typeof schoolData?.name === 'string' && schoolData.name.trim()) ||
      emisor.razonSocial;

    console.log(
      '[emit-batch] emisor:',
      emisor.razonSocial,
      emisor.cuit,
      '| ptoVta:',
      ptoVta,
      '| sendEmail:',
      sendEmail
    );

    const fecha = new Date();
    const fechaStr = fecha.toISOString().slice(0, 10);
    const cbteFch =
      fecha.getFullYear() * 10000 +
      (fecha.getMonth() + 1) * 100 +
      fecha.getDate();

    const cbteTipoLabel = cbteTipo === 11 ? 'FACTURA C' : 'FACTURA B';

    const results: Array<{
      paymentId: string;
      ok: boolean;
      voucherNumber?: number;
      CAE?: string;
      pdfPath?: string;
      filename?: string;
      error?: string;
      emailSent?: boolean;
      emailTo?: string;
      emailSkippedReason?: string;
      emailError?: string;
    }> = [];

    let nextVoucherNumber = 1;
    if (!simulation) {
      try {
        await runWithAfipSession(afipSession, async () => {
          const { getLastVoucher } = await import('@/lib/afip/wsfe');
          nextVoucherNumber = (await getLastVoucher(ptoVta, cbteTipo)) + 1;
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error('[emit-batch] AFIP connect failed:', detail, err);
        return NextResponse.json(
          {
            error: `No se pudo conectar con AFIP: ${detail}`,
          },
          { status: 500 }
        );
      }
    }

    const paymentsCol = db.collection(COLLECTIONS.payments);

    for (const paymentId of paymentIds) {
      try {
        const paymentSnap = await paymentsCol.doc(paymentId).get();
        if (!paymentSnap.exists) {
          console.warn('[emit-batch] Pago no encontrado:', paymentId);
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

        const playerId = pData.playerId as string;
        const amount = Number(pData.amount) ?? 0;
        const period = pData.period as string;
        const currency = pData.currency ?? 'ARS';

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

        const receptorDoc = resolveReceptorDocument(playerData, simulation);
        if ('error' in receptorDoc) {
          results.push({
            paymentId,
            ok: false,
            error:
              receptorDoc.error === 'missing'
                ? `${playerName} no tiene CUIT/DNI cargado. Agregá el CUIT en el perfil del cliente.`
                : `CUIT (11 dígitos) o DNI (8 dígitos) inválido para ${playerName}`,
          });
          continue;
        }
        const { docDisplay: docReceptor, docTipo: tipoDocReceptor, docNro } = receptorDoc;

        // Monto pagado es IVA incluido: total = neto + IVA 21%
        const impTotal = amount;
        const impNeto = Math.round((impTotal / 1.21) * 100) / 100;
        const impIva = Math.round((impTotal - impNeto) * 100) / 100;

        let voucherNumber: number;
        let cae: string;
        let caeVto: string;

        if (simulation) {
          voucherNumber = nextVoucherNumber++;
          cae = `SIM-${Date.now()}-${paymentId.slice(0, 6)}`;
          caeVto = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        } else {
          const condIvaReceptor = condicionIVAtoAfipId(playerData?.condicionIVA);

          const result = await runWithAfipSession(afipSession, () =>
            createNextVoucher({
              PtoVta: ptoVta,
              CbteTipo: cbteTipo,
              Concepto: 2,
              DocTipo: tipoDocReceptor,
              DocNro: docNro,
              CbteFch: cbteFch,
              ImpTotal: impTotal,
              ImpTotConc: 0,
              ImpNeto: impNeto,
              ImpOpEx: 0,
              ImpIVA: impIva,
              ImpTrib: 0,
              MonId: currency === 'USD' ? 'DOL' : 'PES',
              MonCotiz: 1,
              CondIVAReceptor: condIvaReceptor,
              Iva: [{ Id: 5, BaseImp: impNeto, Importe: impIva }],
            })
          );
          voucherNumber = result.voucherNumber;
          cae = result.CAE;
          caeVto = result.CAEFchVto;
        }

        const metadata = (pData.metadata ?? {}) as { concept?: string };
        const concepto =
          period === 'inscripcion'
            ? 'Derecho de inscripción'
            : period.startsWith('ropa-')
              ? `Cuota de indumentaria (${period})`
              : period.startsWith('extra-') && metadata.concept
                ? metadata.concept
                : `Cuota ${period}`;

        const pdfPath = await generarFactura({
          datos: {
            emisor,
            tipoComprobante: cbteTipoLabel,
            puntoVenta: ptoVta,
            numero: voucherNumber,
            fecha: fechaStr,
            receptor: {
              razonSocial: playerName,
              cuit: String(docReceptor),
              domicilio: '-',
              condicionIVA: playerData?.condicionIVA?.trim() || 'Consumidor Final',
            },
            items: [
              {
                descripcion: concepto,
                cantidad: 1,
                precioUnitario: impNeto,
                importe: impNeto,
              },
            ],
            subtotal: impNeto,
            iva21: impIva,
            total: impTotal,
            CAE: cae,
            CAEFchVto: caeVto,
            tipoDocReceptor,
            simulacion: simulation,
          },
          schoolId,
          facturacion,
        });

        const filename = path.basename(pdfPath);
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
          console.error('[emit-batch] No se pudo subir PDF a Storage', paymentId, storageErr);
          facturaStoragePath = undefined;
        }
        const invoiceNumber = formatInvoiceNumber(ptoVta, voucherNumber);
        const amountLabel = formatAmountLabel(impTotal, currency);

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
                simulation,
              });
              emailSent = true;
            } catch (mailErr) {
              emailError =
                mailErr instanceof Error ? mailErr.message : String(mailErr);
              console.error('[emit-batch] Error enviando email', paymentId, mailErr);
            }
          }
        }

        // Marcar pago como facturado
        const now = new Date();
        const paymentUpdate: Record<string, unknown> = {
          facturado: true,
          facturadoAt: now,
          facturaNumero: voucherNumber,
          facturaPtoVta: ptoVta,
          facturaFecha: fechaStr,
          facturaTipo: cbteTipoLabel,
        };
        if (!simulation && cae) {
          paymentUpdate.CAE = cae;
          paymentUpdate.CAEFchVto = caeVto;
        }
        if (facturaStoragePath) {
          paymentUpdate.facturaStoragePath = facturaStoragePath;
        }
        if (sendEmail) {
          paymentUpdate.facturaEmailRequested = true;
          if (emailSent && emailTo) {
            paymentUpdate.facturaEmailSent = true;
            paymentUpdate.facturaEmailTo = emailTo;
            paymentUpdate.facturaEmailSentAt = now;
          } else if (emailSkippedReason) {
            paymentUpdate.facturaEmailSent = false;
            paymentUpdate.facturaEmailSkipReason = emailSkippedReason;
          } else if (emailError) {
            paymentUpdate.facturaEmailSent = false;
            paymentUpdate.facturaEmailError = emailError;
          }
        }
        await paymentsCol.doc(paymentId).update(paymentUpdate);

        results.push({
          paymentId,
          ok: true,
          voucherNumber,
          CAE: cae,
          pdfPath,
          filename,
          ...(sendEmail
            ? {
                emailSent,
                emailTo,
                emailSkippedReason,
                emailError,
              }
            : {}),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[emit-batch] Error facturando', paymentId, err);
        results.push({ paymentId, ok: false, error: msg });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok).length;
    const emailSentCount = results.filter((r) => r.emailSent).length;
    const emailSkippedCount = results.filter((r) => !!r.emailSkippedReason).length;
    const emailFailedCount = results.filter((r) => !!r.emailError).length;

    return NextResponse.json({
      ok: true,
      simulation,
      sendEmail,
      emisor: { razonSocial: emisor.razonSocial, cuit: emisor.cuit, ptoVta },
      total: results.length,
      processed: okCount,
      failed: failCount,
      emailSent: emailSentCount,
      emailSkipped: emailSkippedCount,
      emailFailed: emailFailedCount,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/facturas/emit-batch]', err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
