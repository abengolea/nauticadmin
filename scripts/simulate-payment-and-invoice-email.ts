/**
 * Simula un pago ficticio + factura simulada (sin AFIP) y envía el PDF por email.
 *
 * Destino por defecto: abengolea1@gmail.com
 *
 * Uso:
 *   npx tsx scripts/simulate-payment-and-invoice-email.ts
 *
 * Opcional (env o .env.local):
 *   TO_EMAIL=abengolea1@gmail.com
 *   SCHOOL_ID=WZAf1Mw08Uq047wneIxI   (Yaguarón; se usa si no hay jugador con ese email)
 *   AMOUNT=15000
 *   PERIOD=2026-07
 *   SKIP_PAYMENT=1                   (solo genera factura + email, sin crear pago)
 *
 * Requiere service-account.json (o GOOGLE_APPLICATION_CREDENTIALS).
 * El email se encola en Firestore colección `mail` (extensión Trigger Email).
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
import { sendInvoiceEmail } from '../src/lib/duplicate-payments/email-sender';
import { COLLECTIONS } from '../src/lib/payments/constants';
import { createPayment } from '../src/lib/payments/db';

const DEFAULT_SCHOOL_ID = 'WZAf1Mw08Uq047wneIxI'; // Marinas del Yaguarón
const TO_EMAIL = (process.env.TO_EMAIL ?? 'abengolea1@gmail.com').trim().toLowerCase();
const SCHOOL_ID_ENV = process.env.SCHOOL_ID?.trim();
const AMOUNT = parseFloat(process.env.AMOUNT ?? '15000') || 15000;
const PERIOD =
  process.env.PERIOD ??
  `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
const SKIP_PAYMENT = process.env.SKIP_PAYMENT === '1' || process.env.SKIP_PAYMENT === 'true';

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

function resolveCredentialsPath(): string {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    const absolute = path.isAbsolute(envPath) ? envPath : path.join(cwd, envPath);
    if (fs.existsSync(absolute)) return absolute;
  }
  for (const name of ['service-account.json', 'service-account.json.json']) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) return p;
  }
  return '';
}

function initFirebaseAdmin(): admin.firestore.Firestore {
  if (admin.apps.length > 0) return admin.firestore();
  const credentialsPath = resolveCredentialsPath();
  if (!credentialsPath) {
    console.error(
      'No se encontró service-account.json ni GOOGLE_APPLICATION_CREDENTIALS.'
    );
    process.exit(1);
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  const projectId =
    process.env.GCLOUD_PROJECT ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  admin.initializeApp({
    projectId: projectId || undefined,
    credential: admin.credential.applicationDefault(),
  });
  return admin.firestore();
}

async function findPlayerByEmail(
  db: admin.firestore.Firestore,
  email: string
): Promise<{
  schoolId: string;
  playerId: string;
  firstName?: string;
  lastName?: string;
  cuit?: string;
  dni?: string;
  condicionIVA?: string;
} | null> {
  const emailNorm = email.trim().toLowerCase();
  const schoolsSnap = await db.collection('schools').get();
  for (const schoolDoc of schoolsSnap.docs) {
    const playersSnap = await db
      .collection('schools')
      .doc(schoolDoc.id)
      .collection('players')
      .get();
    const found = playersSnap.docs.find(
      (d) => ((d.data().email as string) ?? '').trim().toLowerCase() === emailNorm
    );
    if (found) {
      const d = found.data();
      return {
        schoolId: schoolDoc.id,
        playerId: found.id,
        firstName: d.firstName,
        lastName: d.lastName,
        cuit: d.cuit,
        dni: d.dni,
        condicionIVA: d.condicionIVA,
      };
    }
  }
  return null;
}

/** Crea un jugador de prueba bajo la náutica indicada (solo para simulación). */
async function ensureSimPlayer(
  db: admin.firestore.Firestore,
  schoolId: string,
  email: string
): Promise<{
  schoolId: string;
  playerId: string;
  firstName: string;
  lastName: string;
}> {
  const playersRef = db.collection('schools').doc(schoolId).collection('players');
  const existing = await playersRef.where('email', '==', email).limit(1).get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    const d = doc.data();
    return {
      schoolId,
      playerId: doc.id,
      firstName: (d.firstName as string) || 'Adrian',
      lastName: (d.lastName as string) || 'Bengolea',
    };
  }

  const ref = await playersRef.add({
    firstName: 'Adrian',
    lastName: 'Bengolea',
    email,
    status: 'active',
    requiereFactura: true,
    condicionIVA: 'Consumidor Final',
    cuit: '20-25715970-2',
    simulatedByScript: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('  Jugador de simulación creado:', ref.id);
  return {
    schoolId,
    playerId: ref.id,
    firstName: 'Adrian',
    lastName: 'Bengolea',
  };
}

function formatAmountLabel(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(amount);
}

function formatInvoiceNumber(ptoVta: number, voucherNumber: number): string {
  return `${String(ptoVta).padStart(4, '0')}-${String(voucherNumber).padStart(8, '0')}`;
}

async function main() {
  console.log('\n=== Simular pago + factura por email ===');
  console.log('  Destino email:', TO_EMAIL);
  console.log('  Período:', PERIOD);
  console.log('  Monto:', AMOUNT, 'ARS');
  console.log('  Crear pago:', SKIP_PAYMENT ? 'no' : 'sí');

  const db = initFirebaseAdmin();

  let player = await findPlayerByEmail(db, TO_EMAIL);
  if (player) {
    console.log(
      '  Jugador encontrado:',
      player.schoolId,
      '/',
      player.playerId,
      '-',
      [player.firstName, player.lastName].filter(Boolean).join(' ')
    );
  } else {
    const schoolId = SCHOOL_ID_ENV || DEFAULT_SCHOOL_ID;
    console.log(
      '  No hay jugador con ese email. Usando náutica',
      schoolId,
      'y creando/asegurando jugador de simulación…'
    );
    const schoolSnap = await db.collection('schools').doc(schoolId).get();
    if (!schoolSnap.exists) {
      console.error('Náutica no encontrada:', schoolId);
      process.exit(1);
    }
    const ensured = await ensureSimPlayer(db, schoolId, TO_EMAIL);
    player = ensured;
  }

  const schoolId = player.schoolId;
  const playerName =
    [player.firstName, player.lastName].filter(Boolean).join(' ').trim() ||
    'Adrian Bengolea';

  let paymentId: string | null = null;
  if (!SKIP_PAYMENT) {
    const providerPaymentId = `sim-mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payment = await createPayment(db, {
      schoolId,
      playerId: player.playerId,
      period: PERIOD,
      amount: AMOUNT,
      currency: 'ARS',
      status: 'approved',
      provider: 'manual',
      providerPaymentId,
      paidAt: new Date(),
      metadata: {
        simulatedByScript: true,
        script: 'simulate-payment-and-invoice-email',
        note: 'Pago ficticio para prueba de factura por email',
      },
    });
    paymentId = payment.id;
    console.log('  ✓ Pago ficticio creado:', paymentId);
  }

  let facturacion: SchoolFacturacion = FALLBACK_FACTURACION;
  try {
    facturacion = await loadSchoolFacturacion(db, schoolId);
  } catch {
    console.log('  (sin facturación en Firestore; usando fallback Yaguarón)');
  }

  const emisor = facturacionToEmisor(facturacion);
  const ptoVta = getPtoVta(facturacion);
  const cbteTipo = getCbteTipo(facturacion);
  const cbteLabel = cbteTipo === 11 ? 'FACTURA C' : 'FACTURA B';
  const impTotal = AMOUNT;
  const impNeto = Math.round((impTotal / 1.21) * 100) / 100;
  const impIva = Math.round((impTotal - impNeto) * 100) / 100;
  const fecha = new Date();
  const fechaStr = fecha.toISOString().slice(0, 10);
  const voucherNumber = Math.floor(Date.now() / 1000) % 100000000;
  const invoiceNumber = formatInvoiceNumber(ptoVta, voucherNumber);
  const cae = `SIM-${Date.now()}`;
  const caeVto = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const docReceptor =
    (typeof player.cuit === 'string' && player.cuit.trim()) ||
    '20-25715970-2';

  console.log('  Emisor:', emisor.razonSocial, emisor.cuit);
  console.log('  Factura sim:', cbteLabel, invoiceNumber);

  const pdfPath = await generarFactura({
    schoolId,
    facturacion,
    datos: {
      emisor,
      tipoComprobante: cbteLabel,
      puntoVenta: ptoVta,
      numero: voucherNumber,
      fecha: fechaStr,
      receptor: {
        razonSocial: playerName,
        cuit: docReceptor,
        domicilio: '-',
        condicionIVA: player.condicionIVA?.trim() || 'Consumidor Final',
      },
      items: [
        {
          descripcion: `Cuota ${PERIOD} (simulación)`,
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
      tipoDocReceptor: 80,
      simulacion: true,
    },
  });

  const filename = path.basename(pdfPath);
  console.log('  ✓ PDF simulado:', pdfPath);

  await sendInvoiceEmail(db, {
    to: TO_EMAIL,
    customerName: playerName,
    invoiceNumber,
    amount: formatAmountLabel(impTotal),
    pdfPath,
    pdfFilename: filename,
    schoolId,
    brandName: emisor.razonSocial,
    simulation: true,
  });
  console.log('  ✓ Email encolado en colección mail →', TO_EMAIL);

  if (paymentId) {
    await db.collection(COLLECTIONS.payments).doc(paymentId).update({
      facturado: true,
      facturadoAt: new Date(),
      facturaNumero: voucherNumber,
      facturaPtoVta: ptoVta,
      facturaFecha: fechaStr,
      facturaTipo: cbteLabel,
      facturaEmailRequested: true,
      facturaEmailSent: true,
      facturaEmailTo: TO_EMAIL,
      facturaEmailSentAt: new Date(),
      CAE: cae,
      CAEFchVto: caeVto,
    });
    console.log('  ✓ Pago marcado como facturado + email enviado');
  }

  console.log('\nListo.');
  console.log('  Revisá la bandeja de', TO_EMAIL, '(y spam).');
  console.log('  El PDF local está en:', pdfPath);
  console.log('  (Comprobante SIMULACIÓN — no válido ante AFIP)\n');
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
