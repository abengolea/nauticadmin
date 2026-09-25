/**
 * POST /api/facturas/emit
 * Emisión unitaria (scripts/admin). Requiere autenticación.
 */

import { NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/auth-server';
import { createNextVoucher } from '@/lib/afip/wsfe';
import { generarFacturaPDF } from '@/lib/factura-pdf';
import { z } from 'zod';
import {
  CONDICION_IVA_RECEPTOR,
  calculateFiscalAmounts,
  CBTE_TIPO,
} from '@/lib/fiscal';

const EmitSchema = z.object({
  receptor: z.object({
    razonSocial: z.string().min(1),
    cuit: z.string().min(10),
    domicilio: z.string().optional().default('-'),
    condicionIVAReceptorId: z.number().optional(),
  }),
  items: z.array(
    z.object({
      descripcion: z.string(),
      cantidad: z.number().positive(),
      precioUnitario: z.number().nonnegative(),
    })
  ),
  cbteTipo: z.number().optional().default(CBTE_TIPO.FACTURA_B),
});

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = EmitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { receptor, items, cbteTipo } = parsed.data;
    const docNro = parseInt(receptor.cuit.replace(/\D/g, ''), 10);
    if (isNaN(docNro) || docNro.toString().length !== 11) {
      return NextResponse.json({ error: 'CUIT del receptor inválido' }, { status: 400 });
    }

    const impTotal = items.reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0);
    const amounts = calculateFiscalAmounts(impTotal, cbteTipo as 1 | 6 | 11);

    const fecha = new Date();
    const cbteFch =
      fecha.getFullYear() * 10000 + (fecha.getMonth() + 1) * 100 + fecha.getDate();
    const fechaStr = fecha.toISOString().slice(0, 10);
    const ptoVta = parseInt(process.env.AFIP_PTO_VTA ?? '1', 10) || 1;

    const result = await createNextVoucher({
      PtoVta: ptoVta,
      CbteTipo: cbteTipo,
      Concepto: 2,
      DocTipo: 80,
      DocNro: docNro,
      CbteFch: cbteFch,
      ImpTotal: amounts.impTotal,
      ImpTotConc: amounts.impTotConc,
      ImpNeto: amounts.impNeto,
      ImpOpEx: amounts.impOpEx,
      ImpIVA: amounts.impIva,
      ImpTrib: amounts.impTrib,
      MonId: 'PES',
      MonCotiz: 1,
      CondIVAReceptor:
        receptor.condicionIVAReceptorId ?? CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
      Iva: amounts.iva,
    });

    const pdfPath = await generarFacturaPDF({
      emisor: {
        razonSocial: process.env.AFIP_RAZON_SOCIAL ?? 'NOTIFICAS S. R. L.',
        cuit: process.env.AFIP_CUIT ?? '33-71729868-9',
        domicilio: process.env.AFIP_DOMICILIO ?? '-',
        condicionIVA: 'Responsable Inscripto',
      },
      tipoComprobante: cbteTipo === CBTE_TIPO.FACTURA_C ? 'FACTURA C' : cbteTipo === CBTE_TIPO.FACTURA_A ? 'FACTURA A' : 'FACTURA B',
      puntoVenta: ptoVta,
      numero: result.voucherNumber,
      fecha: fechaStr,
      receptor: {
        razonSocial: receptor.razonSocial,
        cuit: receptor.cuit,
        domicilio: receptor.domicilio ?? '-',
        condicionIVA: 'Consumidor Final',
      },
      items: items.map((i) => {
        const itemTotal = i.cantidad * i.precioUnitario;
        const itemNeto = Math.round((itemTotal / 1.21) * 100) / 100;
        return {
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precioUnitario: itemNeto / i.cantidad,
          importe: itemNeto,
        };
      }),
      subtotal: amounts.impNeto,
      iva21: amounts.impIva,
      total: amounts.impTotal,
      CAE: result.CAE,
      CAEFchVto: result.CAEFchVto,
      tipoDocReceptor: 80,
    });

    return NextResponse.json({
      ok: true,
      voucherNumber: result.voucherNumber,
      CAE: result.CAE,
      CAEFchVto: result.CAEFchVto,
      pdfPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
