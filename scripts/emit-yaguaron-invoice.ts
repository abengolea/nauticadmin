/**
 * Emite una factura REAL a AFIP para Marinas del Yaguarón (Yaguaron SA).
 *
 * Modelo delegación ARCA: certificados Notificas SRL + CUIT emisor Yaguaron en WSFE.
 *
 * Uso:
 *   npx tsx scripts/emit-yaguaron-invoice.ts              → $10 prod
 *   npx tsx scripts/emit-yaguaron-invoice.ts 10 prod       → $10 prod
 *   npx tsx scripts/emit-yaguaron-invoice.ts 10 homo       → $10 homologación
 *
 * Requiere en afip/:
 *   prod: certificado_prod.crt, privada_prod.key, chain_prod.pem
 *   homo: certificado_homo.crt, privada_homo.key, chain.pem
 *
 * Env opcional: .env.local y/o .env.afip.prod / .env.afip.homo
 */
import '../src/lib/afip/tls-patch';

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as admin from 'firebase-admin';

const cwd = process.cwd();
dotenv.config();
dotenv.config({ path: path.resolve(cwd, '.env.local'), override: true });

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const impTotal = parseFloat(args[0] ?? '10') || 10;
const envArg = (args[1] ?? 'prod').toLowerCase();
const production = envArg !== 'homo';

if (envArg === 'homo' || envArg === 'prod') {
  const envFile = path.resolve(cwd, `.env.afip.${envArg}`);
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true });
  }
}

process.env.AFIP_PRODUCTION = production ? 'true' : 'false';

import { createNextVoucher } from '../src/lib/afip/wsfe';
import { runWithAfipSession } from '../src/lib/afip/session';
import { generarFactura } from '../src/lib/factura-pdf';
import {
  loadSchoolFacturacion,
  facturacionToEmisor,
  facturacionToAfipSession,
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
  afipProduction: production,
};

/** Receptor por defecto para prueba local (CUIT válido) */
const RECEPTOR = {
  razonSocial: process.env.FACTURA_RECEPTOR_NOMBRE ?? 'Adrian Bengolea',
  cuit: process.env.FACTURA_RECEPTOR_CUIT ?? '20-25715970-2',
  docNro: parseInt(
    (process.env.FACTURA_RECEPTOR_CUIT ?? '20257159702').replace(/\D/g, ''),
    10
  ),
  docTipo: 80 as const,
  condicionIVA: 'Consumidor Final',
  condIvaAfip: 5,
};

function resolveCredentialsPath(): string {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    const absolute = path.isAbsolute(envPath) ? envPath : path.join(cwd, envPath);
    if (fs.existsSync(absolute)) return absolute;
  }
  const candidates = [
    path.join(cwd, 'service-account.json'),
    'C:/SECRETS/nauticadmin-firebase-adminsdk-fbsvc-d511f4fa32.json',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

function loadLocalTemplate(base: SchoolFacturacion): SchoolFacturacion {
  const templateFile = path.join(cwd, 'afip/templates/yaguaron-template.json');
  if (!fs.existsSync(templateFile)) return base;
  const raw = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
  const template = parseTemplateFactura(raw);
  return template ? { ...base, templateFactura: template } : base;
}

function assertAfipCerts(session: ReturnType<typeof facturacionToAfipSession>): void {
  const missing: string[] = [];
  for (const [label, p] of [
    ['certificado', session.certPath],
    ['clave privada', session.keyPath],
  ] as const) {
    if (!fs.existsSync(p)) missing.push(`${label}: ${p}`);
  }
  if (missing.length) {
    throw new Error(
      `Faltan certificados AFIP de Notificas SRL (${production ? 'producción' : 'homologación'}):\n` +
        missing.map((m) => `  - ${m}`).join('\n') +
        '\n\nCopiá los archivos a afip/ y creá .env.afip.prod (ver .env.afip.prod.example).'
    );
  }
}

async function main() {
  let facturacion: SchoolFacturacion = loadLocalTemplate({
    ...FALLBACK_FACTURACION,
    afipProduction: production,
  });

  const credPath = resolveCredentialsPath();
  if (credPath) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
    try {
      facturacion = await loadSchoolFacturacion(admin.firestore(), SCHOOL_ID);
      facturacion = { ...facturacion, afipProduction: production };
    } catch {
      /* fallback local */
    }
  }

  const emisor = facturacionToEmisor(facturacion);
  const afipSession = facturacionToAfipSession(facturacion);
  const ptoVta = getPtoVta(facturacion);
  const cbteTipo = getCbteTipo(facturacion);
  const cbteLabel = cbteTipo === 11 ? 'FACTURA C' : 'FACTURA B';

  assertAfipCerts(afipSession);

  const impNeto = Math.round((impTotal / 1.21) * 100) / 100;
  const impIva = Math.round((impTotal - impNeto) * 100) / 100;

  const fecha = new Date();
  const cbteFch =
    fecha.getFullYear() * 10000 + (fecha.getMonth() + 1) * 100 + fecha.getDate();
  const fechaStr = fecha.toISOString().slice(0, 10);

  console.log('\n--- Emisión REAL AFIP — Marinas del Yaguarón ---');
  console.log('Entorno:', production ? 'PRODUCCIÓN' : 'HOMOLOGACIÓN');
  console.log('Emisor:', emisor.razonSocial, emisor.cuit);
  console.log('Pto vta:', ptoVta, '| Tipo:', cbteLabel);
  console.log('Receptor:', RECEPTOR.razonSocial, RECEPTOR.cuit);
  console.log('Total:', impTotal, 'ARS (neto', impNeto, '+ IVA', impIva, ')');
  console.log('Cert:', path.basename(afipSession.certPath));
  console.log('');

  const result = await runWithAfipSession(afipSession, () =>
    createNextVoucher({
      PtoVta: ptoVta,
      CbteTipo: cbteTipo,
      Concepto: 2,
      DocTipo: RECEPTOR.docTipo,
      DocNro: RECEPTOR.docNro,
      CbteFch: cbteFch,
      ImpTotal: impTotal,
      ImpTotConc: 0,
      ImpNeto: impNeto,
      ImpOpEx: 0,
      ImpIVA: impIva,
      ImpTrib: 0,
      MonId: 'PES',
      MonCotiz: 1,
      CondIVAReceptor: RECEPTOR.condIvaAfip,
      Iva: [{ Id: 5, BaseImp: impNeto, Importe: impIva }],
    })
  );

  console.log('✓ CAE obtenido');
  console.log('  Número:', result.voucherNumber);
  console.log('  CAE:', result.CAE);
  console.log('  Vto CAE:', result.CAEFchVto);

  const pdfPath = await generarFactura({
    schoolId: SCHOOL_ID,
    facturacion,
    datos: {
      emisor,
      tipoComprobante: cbteLabel,
      puntoVenta: ptoVta,
      numero: result.voucherNumber,
      fecha: fechaStr,
      receptor: {
        razonSocial: RECEPTOR.razonSocial,
        cuit: RECEPTOR.cuit,
        domicilio: '-',
        condicionIVA: RECEPTOR.condicionIVA,
      },
      items: [
        {
          descripcion: 'Prueba emisión real local',
          cantidad: 1,
          precioUnitario: impNeto,
          importe: impNeto,
        },
      ],
      subtotal: impNeto,
      iva21: impIva,
      total: impTotal,
      CAE: result.CAE,
      CAEFchVto: result.CAEFchVto,
      tipoDocReceptor: RECEPTOR.docTipo,
      simulacion: false,
    },
  });

  console.log('✓ PDF:', pdfPath);
  console.log('');
}

main().catch((err) => {
  console.error('\n❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
