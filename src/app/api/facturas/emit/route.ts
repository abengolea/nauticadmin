/**
 * POST /api/facturas/emit
 * Emite una factura electrónica a AFIP y genera el PDF.
 * Devuelve CAE, número y path del PDF generado.
 *
 * Body: {
 *   receptor: { razonSocial, cuit, domicilio?, condicionIVA? },
 *   items: [{ descripcion, cantidad, precioUnitario }],
 *   concepto?: string (default: primer item o "Servicios")
 * }
 */

import { NextResponse } from 'next/server';
import { createNextVoucher } from '@/lib/afip/wsfe';
import { generarFacturaPDF } from '@/lib/factura-pdf';
import { z } from 'zod';

const EmitSchema = z.object({
  receptor: z.object({
    razonSocial: z.string().min(1),
    cuit: z.string().min(10),
    domicilio: z.string().optional().default('-'),
    condicionIVA: z.string().optional().default('Consumidor Final'),
  }),
  items: z.array(
    z.object({
      descripcion: z.string(),
      cantidad: z.number().positive(),
      precioUnitario: z.number().nonnegative(),
    })
  ),
  concepto: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = EmitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { receptor, items, concepto } = parsed.data;

    const docNro = parseInt(receptor.cuit.replace(/\D/g, ''), 10);
    if (isNaN(docNro) || docNro.toString().length !== 11) {
      return NextResponse.json(
        { error: 'CUIT del receptor inválido' },
        { status: 400 }
      );
    }

    // Los precios son IVA incluido: total = neto + IVA 21%
    const impTotal = items.reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0);
    const impNeto = Math.round((impTotal / 1.21) * 100) / 100;
    const impIva = Math.round((impTotal - impNeto) * 100) / 100;

    const fecha = new Date();
    const cbteFch =
      fecha.getFullYear() * 10000 +
      (fecha.getMonth() + 1) * 100 +
      fecha.getDate();
    const fechaStr = fecha.toISOString().slice(0, 10);

    const ptoVta = parseInt(process.env.AFIP_PTO_VTA ?? '1', 10) || 1;
    const cbteTipo = parseInt(process.env.AFIP_CBTE_TIPO ?? '6', 10) || 6;

    const result = await createNextVoucher({
      PtoVta: ptoVta,
      CbteTipo: cbteTipo,
      Concepto: 2,
      DocTipo: 80,
      DocNro: docNro,
      CbteFch: cbteFch,
      ImpTotal: impTotal,
      ImpTotConc: 0,
      ImpNeto: impNeto,
      ImpOpEx: 0,
      ImpIVA: impIva,
      ImpTrib: 0,
      MonId: 'PES',
      MonCotiz: 1,
      CondIVAReceptor: 5,
      Iva: [{ Id: 5, BaseImp: impNeto, Importe: impIva }],
    });

    const pdfPath = await generarFacturaPDF({
      emisor: {
        razonSocial: process.env.AFIP_RAZON_SOCIAL ?? 'NOTIFICAS S. R. L.',
        cuit: process.env.AFIP_CUIT ?? '33-71729868-9',
        domicilio: process.env.AFIP_DOMICILIO ?? 'Av. Corrientes 1234, CABA',
        condicionIVA: 'Responsable Inscripto',
      },
      tipoComprobante: 'FACTURA B',
      puntoVenta: ptoVta,
      numero: result.voucherNumber,
      fecha: fechaStr,
      receptor: {
        razonSocial: receptor.razonSocial,
        cuit: receptor.cuit,
        domicilio: receptor.domicilio ?? '-',
        condicionIVA: receptor.condicionIVA ?? 'Consumidor Final',
      },
      items: items.map((i) => {
        const itemTotal = i.cantidad * i.precioUnitario;
        const itemNeto = Math.round((itemTotal / 1.21) * 100) / 100;
        const precioUnitarioNeto = i.cantidad > 0 ? Math.round((itemNeto / i.cantidad) * 100) / 100 : 0;
        return {
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precioUnitario: precioUnitarioNeto,
          importe: itemNeto,
        };
      }),
      subtotal: impNeto,
      iva21: impIva,
      total: impTotal,
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
    console.error('[api/facturas/emit]', err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
