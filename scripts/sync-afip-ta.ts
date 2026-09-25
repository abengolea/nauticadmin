/**
 * Publica el TA WSAA local en Firestore para que App Hosting lo reutilice.
 *
 *   npx tsx scripts/sync-afip-ta.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as admin from 'firebase-admin';
import { AFIP_TA_COLLECTION, sharedTaDocId, isTaValid } from '../src/lib/afip/ta-store';

const cwd = process.cwd();
dotenv.config({ path: path.resolve(cwd, '.env.local') });
dotenv.config({ path: path.resolve(cwd, '.env.afip.prod'), override: true });

const workDir = process.env.AFIP_WORK_DIR
  ? path.resolve(process.env.AFIP_WORK_DIR)
  : path.join(cwd, 'afip');

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

function findLocalTa(): { token: string; sign: string; expirationTime: string; file: string } | null {
  if (!fs.existsSync(workDir)) return null;
  const files = fs
    .readdirSync(workDir)
    .filter((f) => f.startsWith('ta_wsfe_') && f.endsWith('_prod.json'))
    .map((f) => path.join(workDir, f));
  for (const file of files) {
    try {
      const ta = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        token?: string;
        sign?: string;
        expirationTime?: string;
      };
      if (ta.token && ta.sign && ta.expirationTime && isTaValid(ta as { token: string; sign: string; expirationTime: string }, 0)) {
        return {
          token: ta.token,
          sign: ta.sign,
          expirationTime: ta.expirationTime,
          file,
        };
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

async function main() {
  const ta = findLocalTa();
  if (!ta) {
    throw new Error(`No hay un TA de producción vigente en ${workDir}`);
  }

  const credPath = resolveCredentialsPath();
  if (!credPath) throw new Error('No se encontró service-account.json');
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }

  const docId = sharedTaDocId(true);
  await admin.firestore().collection(AFIP_TA_COLLECTION).doc(docId).set({
    token: ta.token,
    sign: ta.sign,
    expirationTime: ta.expirationTime,
    updatedAt: new Date().toISOString(),
    sourceFile: path.basename(ta.file),
  });

  console.log('TA publicado en Firestore');
  console.log('  doc:', `${AFIP_TA_COLLECTION}/${docId}`);
  console.log('  vence:', ta.expirationTime);
  console.log('  origen:', ta.file);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
