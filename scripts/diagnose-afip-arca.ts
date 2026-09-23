/**
 * Diagnóstico de conexión ARCA/AFIP (sin emitir factura).
 *
 * Uso:
 *   npx cross-env OPENSSL_CONF=./openssl.cnf tsx scripts/diagnose-afip-arca.ts
 */
import '../src/lib/afip/tls-patch';

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { execSync } from 'child_process';
import * as admin from 'firebase-admin';
import { runWithAfipSession, type AfipSession } from '../src/lib/afip/session';
import { getAfipToken } from '../src/lib/afip/wsaa';
import { getLastVoucher } from '../src/lib/afip/wsfe';

const cwd = process.cwd();
dotenv.config({ path: path.resolve(cwd, '.env.local') });
dotenv.config({ path: path.resolve(cwd, '.env.afip.prod'), override: true });

const SCHOOL_ID = 'WZAf1Mw08Uq047wneIxI';
const YAGUARON_CUIT = '30714605522';
const NOTIFICAS_CUIT = '33717298689';
const OLD_CUIT = '30693887743';

function resolveCredentialsPath(): string {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    const absolute = path.isAbsolute(envPath) ? envPath : path.join(cwd, envPath);
    if (fs.existsSync(absolute)) return absolute;
  }
  for (const p of [
    path.join(cwd, 'service-account.json'),
    'C:/SECRETS/nauticadmin-firebase-adminsdk-fbsvc-d511f4fa32.json',
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

function fileStatus(p: string): string {
  if (!p) return 'NO DEFINIDO';
  return fs.existsSync(p) ? `OK (${p})` : `FALTA (${p})`;
}

function opensslPath(): string {
  const envPath = process.env.AFIP_OPENSSL_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const candidates = [
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'openssl';
}

function inspectCert(certPath: string): void {
  if (!fs.existsSync(certPath)) {
    console.log('  certificado: NO EXISTE');
    return;
  }
  try {
    const openssl = opensslPath();
    const out = execSync(`"${openssl}" x509 -in "${certPath}" -noout -subject -issuer -dates`, {
      encoding: 'utf8',
    });
    console.log(out.trim().replace(/^/gm, '  '));
  } catch (e) {
    console.log('  no se pudo leer el certificado:', e instanceof Error ? e.message : e);
  }
}

function inspectTa(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    console.log(`  TA ${path.basename(filePath)}: no existe`);
    return;
  }
  try {
    const ta = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { expirationTime?: string };
    const exp = ta.expirationTime ? new Date(ta.expirationTime) : null;
    const valid = exp ? exp.getTime() > Date.now() : false;
    console.log(
      `  TA ${path.basename(filePath)}: expira ${ta.expirationTime ?? '?'} → ${valid ? 'VIGENTE' : 'VENCIDO'}`
    );
  } catch {
    console.log(`  TA ${path.basename(filePath)}: ilegible`);
  }
}

function pingHttps(url: string): Promise<string> {
  return new Promise((resolve) => {
    const req = https.request(
      url,
      { method: 'GET', timeout: 15000 },
      (res) => {
        res.resume();
        resolve(`HTTP ${res.statusCode}`);
      }
    );
    req.on('error', (err) => resolve(`ERROR ${err.message}`));
    req.on('timeout', () => {
      req.destroy();
      resolve('TIMEOUT 15s');
    });
    req.end();
  });
}

function makeSession(cuit: string): AfipSession {
  return {
    cuit,
    certPath:
      process.env.AFIP_CERT_PATH ??
      'C:/secure/afip/prod/certificado_notificas_prod_2026.crt',
    keyPath:
      process.env.AFIP_KEY_PATH ??
      'C:/secure/afip/prod/privada_notificas_prod_2026.key',
    chainPath:
      process.env.AFIP_CHAIN_PATH ?? 'C:/secure/afip/prod/chain_prod.pem',
    production: true,
    cacheKey: 'certificado_notificas_prod_2026',
  };
}

async function main() {
  console.log('=== 1) ENV y archivos ===');
  const certPath =
    process.env.AFIP_CERT_PATH ?? 'C:/secure/afip/prod/certificado_notificas_prod_2026.crt';
  const keyPath =
    process.env.AFIP_KEY_PATH ?? 'C:/secure/afip/prod/privada_notificas_prod_2026.key';
  const chainPath =
    process.env.AFIP_CHAIN_PATH ?? 'C:/secure/afip/prod/chain_prod.pem';
  const workDir = process.env.AFIP_WORK_DIR ?? 'C:/secure/afip/cache';

  console.log('AFIP_PRODUCTION=', process.env.AFIP_PRODUCTION);
  console.log('cert :', fileStatus(certPath));
  console.log('key  :', fileStatus(keyPath));
  console.log('chain:', fileStatus(chainPath));
  console.log('work :', fileStatus(workDir));
  console.log('');

  console.log('=== 2) Certificado Notificas (OpenSSL) ===');
  inspectCert(certPath);
  console.log('');

  console.log('=== 3) Tickets WSAA en caché ===');
  inspectTa(path.join(workDir, 'ta_wsfe_certificado_notificas_prod_2026_prod.json'));
  inspectTa(path.join(workDir, 'ta_wsfe_prod_33717298689.json'));
  inspectTa(path.join(cwd, 'afip/ta_wsfe_certificado_prod_prod.json'));
  console.log('');

  console.log('=== 4) Firestore school.facturacion (Yaguaron) ===');
  const credPath = resolveCredentialsPath();
  if (credPath) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(credPath),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    }
    const snap = await admin.firestore().collection('schools').doc(SCHOOL_ID).get();
    const f = (snap.data()?.facturacion ?? {}) as Record<string, unknown>;
    console.log('  school existe:', snap.exists);
    console.log('  razonSocial:', f.razonSocial);
    console.log('  cuit:', f.cuit);
    console.log('  ptoVta:', f.ptoVta);
    console.log('  cbteTipo:', f.cbteTipo);
    console.log('  afipProduction:', f.afipProduction);
    console.log('  afipCertPath:', f.afipCertPath ?? '(usa env / default)');
    console.log('  afipKeyPath:', f.afipKeyPath ? '(definido)' : '(usa env / default)');
  } else {
    console.log('  sin credenciales Firebase');
  }
  console.log('');

  console.log('=== 5) Reachability HTTPS ARCA ===');
  const endpoints = [
    'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
    'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  ];
  for (const url of endpoints) {
    const status = await pingHttps(url);
    console.log(`  ${status.padEnd(28)} ${url}`);
  }
  console.log('');

  const session = makeSession(YAGUARON_CUIT);

  console.log('=== 6) WSAA login (token, no emite factura) ===');
  try {
    const t0 = Date.now();
    const token = await runWithAfipSession(session, () => getAfipToken());
    console.log(
      `  OK en ${Date.now() - t0}ms | token=${token.token ? `${token.token.length} chars` : 'vacío'} | sign=${token.sign ? `${token.sign.length} chars` : 'vacío'}`
    );
  } catch (e) {
    console.log('  FALLO WSAA:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
    return;
  }
  console.log('');

  console.log('=== 7) WSFE FECompUltimoAutorizado (delegación) ===');
  const cases: Array<{ label: string; cuit: string; pto: number; tipo: number }> = [
    { label: 'Yaguaron SA pto 6 Factura B', cuit: YAGUARON_CUIT, pto: 6, tipo: 6 },
    { label: 'Yaguaron SA pto 1 Factura B', cuit: YAGUARON_CUIT, pto: 1, tipo: 6 },
    { label: 'Notificas SRL pto 1 Factura B', cuit: NOTIFICAS_CUIT, pto: 1, tipo: 6 },
    { label: 'CUIT viejo 30693887743 pto 6', cuit: OLD_CUIT, pto: 6, tipo: 6 },
  ];

  for (const c of cases) {
    try {
      const n = await runWithAfipSession(makeSession(c.cuit), () =>
        getLastVoucher(c.pto, c.tipo)
      );
      console.log(`  OK  ${c.label} (CUIT ${c.cuit}) → último = ${n}`);
    } catch (e) {
      console.log(
        `  ERR ${c.label} (CUIT ${c.cuit}) → ${e instanceof Error ? e.message : e}`
      );
    }
  }
}

main().catch((err) => {
  console.error('Diagnóstico abortado:', err);
  process.exit(1);
});
