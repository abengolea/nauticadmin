/**

 * Genera una factura SIMULADA (sin AFIP) usando plantilla Marinas si está disponible.

 *

 * Uso: npx tsx scripts/emit-simulation-invoice.ts [monto]

 * Ejemplo: npx tsx scripts/emit-simulation-invoice.ts 50

 */

import * as dotenv from 'dotenv';

import * as path from 'path';

import * as fs from 'fs';

import * as admin from 'firebase-admin';



const cwd = process.cwd();

dotenv.config();

dotenv.config({ path: path.resolve(cwd, '.env.local'), override: true });



import { generarFactura } from '../src/lib/factura-pdf';

import {

  loadSchoolFacturacion,

  facturacionToEmisor,

  getPtoVta,

  getCbteTipo,

  type SchoolFacturacion,

} from '../src/lib/school-facturacion';

import { parseTemplateFactura } from '../src/lib/factura-pdf-template';



const SCHOOL_ID = 'WZAf1Mw08Uq047wneIxI';



const FALLBACK_FACTURACION: SchoolFacturacion = {

  razonSocial: 'EL YAGUARON SA',

  cuit: '30-71460552-2',

  domicilio: 'Alberdi 25 - 2900 - San Nicolás - Buenos Aires',

  condicionIVA: 'Resp. Inscripto',

  telefono: '0336-4427907',

  email: 'marinasdelyaguaron@gmail.com',

  ingBrutos: '30714605522',

  inicioActividades: '01/11/2014',

  operacion: '0001-marinasdelyaguaron',

  ptoVta: 6,

  cbteTipo: 6,

};



const impTotal = parseFloat(process.argv[2] ?? '50') || 50;



function resolveCredentialsPath(): string {

  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (envPath) {

    const absolute = path.isAbsolute(envPath) ? envPath : path.join(cwd, envPath);

    if (fs.existsSync(absolute)) return absolute;

  }

  const root = path.join(cwd, 'service-account.json');

  if (fs.existsSync(root)) return root;

  return '';

}



function loadLocalTemplate(): SchoolFacturacion {

  const templateFile = path.join(cwd, 'afip/templates/yaguaron-template.json');

  const base = { ...FALLBACK_FACTURACION };

  if (fs.existsSync(templateFile)) {

    const raw = JSON.parse(fs.readFileSync(templateFile, 'utf8'));

    const template = parseTemplateFactura(raw);

    if (template) return { ...base, templateFactura: template };

  }

  return base;

}



async function main() {

  let facturacion: SchoolFacturacion = loadLocalTemplate();

  let source = facturacion.templateFactura

    ? 'plantilla local (afip/templates/)'

    : 'datos básicos';



  const credPath = resolveCredentialsPath();

  if (credPath) {

    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

    if (!admin.apps.length) {

      admin.initializeApp({ credential: admin.credential.applicationDefault() });

    }

    try {

      facturacion = await loadSchoolFacturacion(admin.firestore(), SCHOOL_ID);

      source = 'Firestore (plantilla + emisor)';

    } catch {

      /* keep local template */

    }

  }



  const emisor = facturacionToEmisor(facturacion);

  const ptoVta = getPtoVta(facturacion);

  const cbteTipo = getCbteTipo(facturacion);

  const cbteLabel = cbteTipo === 11 ? 'FACTURA C' : 'FACTURA B';



  const impNeto = Math.round((impTotal / 1.21) * 100) / 100;

  const impIva = Math.round((impTotal - impNeto) * 100) / 100;



  const fecha = new Date();

  const fechaStr = fecha.toISOString().slice(0, 10);

  const voucherNumber = Math.floor(Date.now() / 1000) % 100000000;



  console.log('\n--- Simulación de factura (NO AFIP) ---');

  console.log('Fuente:', source);

  console.log('Emisor:', emisor.razonSocial, emisor.cuit);

  console.log('Pto vta:', ptoVta, '| Total:', impTotal, 'ARS\n');



  const pdfPath = await generarFactura({

    schoolId: SCHOOL_ID,

    facturacion,

    datos: {

      emisor,

      tipoComprobante: cbteLabel,

      puntoVenta: ptoVta,

      numero: voucherNumber,

      fecha: fechaStr,

      receptor: {

        razonSocial: 'Cliente Prueba Simulación',

        cuit: '20-00000000-0',

        domicilio: '-',

        condicionIVA: 'Consumidor Final',

      },

      items: [

        {

          descripcion: 'Prueba simulación local',

          cantidad: 1,

          precioUnitario: impNeto,

          importe: impNeto,

        },

      ],

      subtotal: impNeto,

      iva21: impIva,

      total: impTotal,

      CAE: `SIM-${Date.now()}`,

      CAEFchVto: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),

      tipoDocReceptor: 96,

      simulacion: true,

    },

  });



  console.log('✓ PDF generado:', pdfPath);

  console.log('  (marca SIMULACIÓN — no válido ante AFIP)\n');

}



main().catch((err) => {

  console.error('Error:', err instanceof Error ? err.message : err);

  process.exit(1);

});


