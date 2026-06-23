/**
 * POST /api/facturas/emit-batch
 * Emite facturas para los pagos seleccionados.
 * Modo simulación: no llama AFIP, genera PDF con marca "SIMULACIÓN".
 * Modo real: emite a AFIP homologación/producción según config.
 */

import * as path from 'path';
import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
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
import { COLLECTIONS } from '@/lib/payments/constants';
import { z } from 'zod';

const EmitBatchSchema = z.object({
  schoolId: z.string().min(1),
  paymentIds: z.array(z.string()).min(1).max(50),
  /** true = no emite a AFIP, solo genera PDF simulado */
  simulation: z.boolean().optional().default(true),
});

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

    const { schoolId, paymentIds, simulation } = parsed.data;

    const db = getAdminFirestore();

    const facturacion = await loadSchoolFacturacion(db, schoolId);
    const afipSession = facturacionToAfipSession(facturacion);
    const emisor = facturacionToEmisor(facturacion);
    const ptoVta = getPtoVta(facturacion);
    const cbteTipo = getCbteTipo(facturacion);

    // Verificar acceso a la escuela
    const schoolUserSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('users')
      .doc(auth.uid)
      .get();
    if (!schoolUserSnap.exists) {
      return NextResponse.json({ error: 'Sin acceso a esta escuela' }, { status: 403 });
    }

    console.log('[emit-batch] emisor:', emisor.razonSocial, emisor.cuit, '| ptoVta:', ptoVta);

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
    }> = [];

    let nextVoucherNumber = 1;
    if (!simulation) {
      try {
        await runWithAfipSession(afipSession, async () => {
          const { getLastVoucher } = await import('@/lib/afip/wsfe');
          nextVoucherNumber = (await getLastVoucher(ptoVta, cbteTipo)) + 1;
        });
      } catch {
        return NextResponse.json(
          {
            error:
              'No se pudo conectar con AFIP. Verificá certificados de Notificas SRL y la delegación de Yaguaron en ARCA.',
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
          results.push({ paymentId, ok: false, error: 'Pago no pertenece a esta escuela' });
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

        let docReceptor = playerData?.cuit;
        let tipoDocReceptor = 80;
        if (!docReceptor && playerData?.dni) {
          const dniNum = String(playerData.dni).replace(/\D/g, '').padStart(8, '0');
          docReceptor = simulation ? '20-00000000-0' : (dniNum.length === 8 ? `20-${dniNum}-0` : '');
          tipoDocReceptor = 96;
        }
        if (!docReceptor) {
          docReceptor = simulation ? '20-00000000-0' : '';
        }

        if (!simulation && !playerData?.cuit && !playerData?.dni) {
          results.push({
            paymentId,
            ok: false,
            error: `${playerName} no tiene CUIT/DNI cargado. Agregá el CUIT en el perfil del cliente.`,
          });
          continue;
        }

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
          const docStr = String(docReceptor).replace(/\D/g, '');
          const docNro = parseInt(docStr, 10);
          const isCuit = docStr.length === 11;
          const isDni = docStr.length === 8;
          if (isNaN(docNro) || (!isCuit && !isDni)) {
            results.push({
              paymentId,
              ok: false,
              error: `CUIT (11 dígitos) o DNI (8 dígitos) inválido para ${playerName}`,
            });
            continue;
          }

          const condIvaReceptor = condicionIVAtoAfipId(playerData?.condicionIVA);

          const result = await runWithAfipSession(afipSession, () =>
            createNextVoucher({
              PtoVta: ptoVta,
              CbteTipo: cbteTipo,
              Concepto: 2,
              DocTipo: isCuit ? 80 : 96,
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
        await paymentsCol.doc(paymentId).update(paymentUpdate);

        results.push({
          paymentId,
          ok: true,
          voucherNumber,
          CAE: cae,
          pdfPath,
          filename,
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
      emisor: { razonSocial: emisor.razonSocial, cuit: emisor.cuit, ptoVta },
      total: results.length,
      processed: okCount,
      failed: failCount,
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
