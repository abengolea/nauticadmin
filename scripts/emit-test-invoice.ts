/**
 * Emite una factura de prueba a AFIP (homologación).
 *
 * Uso:
 *   npx tsx scripts/emit-test-invoice.ts
 *
 * Requiere .env.local con AFIP_CUIT, certificados en afip/, etc.
 *
 * Por defecto emite: $100 + 21% IVA = $121 total, a Adrian Bengolea CUIT 20257159702, servicios varios.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import { createNextVoucher } from '../src/lib/afip/wsfe';
import { generarFacturaPDF } from '../src/lib/factura-pdf';

async function main() {
  const ptoVta = parseInt(process.env.AFIP_PTO_VTA ?? '1', 10) || 1;
  const cbteTipo = parseInt(process.env.AFIP_CBTE_TIPO ?? '6', 10) || 6; // 6 = Factura B

  // Monto IVA incluido (lo que paga el cliente)
  const impTotal = 121;
  const impNeto = Math.round((impTotal / 1.21) * 100) / 100;
  const impIva = Math.round((impTotal - impNeto) * 100) / 100;
  const concepto = 'Servicios varios';

  const fecha = new Date();
  const cbteFch =
    fecha.getFullYear() * 10000 +
    (fecha.getMonth() + 1) * 100 +
    fecha.getDate();
  const fechaStr = fecha.toISOString().slice(0, 10);

  const cuitEmisor = process.env.AFIP_CUIT ?? '33-71729868-9';
  const emisorRazonSocial = process.env.AFIP_RAZON_SOCIAL ?? 'NOTIFICAS S. R. L.';
  const emisorDomicilio = process.env.AFIP_DOMICILIO ?? 'Av. Corrientes 1234, CABA';

  console.log('\n--- Emisión de factura de prueba ---');
  console.log('Cliente: Adrian Bengolea');
  console.log('CUIT: 20257159702');
  console.log('Concepto:', concepto);
  console.log('Neto: $', impNeto);
  console.log('IVA 21%: $', impIva);
  console.log('Total: $', impTotal);
  console.log('PtoVta:', ptoVta, '| CbteTipo:', cbteTipo, '(Factura B)');
  console.log('');

  const result = await createNextVoucher({
    PtoVta: ptoVta,
    CbteTipo: cbteTipo,
    Concepto: 2, // Servicios
    DocTipo: 80, // CUIT
    DocNro: 20257159702,
    CbteFch: cbteFch,
    ImpTotal: impTotal,
    ImpTotConc: 0,
    ImpNeto: impNeto,
    ImpOpEx: 0,
    ImpIVA: impIva,
    ImpTrib: 0,
    MonId: 'PES',
    MonCotiz: 1,
    CondIVAReceptor: 5, // Consumidor Final
    Iva: [{ Id: 5, BaseImp: impNeto, Importe: impIva }], // Id 5 = 21%
  });

  console.log('✓ Factura emitida correctamente');
  console.log('  Número:', result.voucherNumber);
  console.log('  CAE:', result.CAE);
  console.log('  CAE vto:', result.CAEFchVto);

  // Generar PDF
  const pdfPath = await generarFacturaPDF({
    emisor: {
      razonSocial: emisorRazonSocial,
      cuit: cuitEmisor,
      domicilio: emisorDomicilio,
      condicionIVA: 'Responsable Inscripto',
    },
    tipoComprobante: 'FACTURA B',
    puntoVenta: ptoVta,
    numero: result.voucherNumber,
    fecha: fechaStr,
    receptor: {
      razonSocial: 'Adrian Bengolea',
      cuit: '20-25715970-2',
      domicilio: '-',
      condicionIVA: 'Consumidor Final',
    },
    items: [
      { descripcion: concepto, cantidad: 1, precioUnitario: impNeto, importe: impNeto },
    ],
    subtotal: impNeto,
    iva21: impIva,
    total: impTotal,
    CAE: result.CAE,
    CAEFchVto: result.CAEFchVto,
    tipoDocReceptor: 80,
  });

  console.log('  PDF:', pdfPath);
  console.log('');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
