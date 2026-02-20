/**
 * Crea un usuario super admin en Firebase Auth y Firestore (platformUsers).
 *
 * Uso (Linux/Mac):
 *   ADMIN_EMAIL=abengolea1@gmail.com ADMIN_PASSWORD=tucontraseña npx tsx scripts/create-super-admin.ts
 *
 * Uso (PowerShell):
 *   $env:ADMIN_EMAIL="abengolea1@gmail.com"; $env:ADMIN_PASSWORD="tucontraseña"; npx tsx scripts/create-super-admin.ts
 *
 * Variables de entorno:
 *   - ADMIN_EMAIL: email del super admin (default: abengolea1@gmail.com)
 *   - ADMIN_PASSWORD: contraseña para el usuario (requerido)
 *   - GOOGLE_APPLICATION_CREDENTIALS o service-account.json en la raíz
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as admin from 'firebase-admin';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'abengolea1@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim();

const projectId =
  process.env.GCLOUD_PROJECT ??
  process.env.FIREBASE_PROJECT_ID ??
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

function resolveCredentialsPath(): string {
  const cwd = process.cwd();
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    const absolute = path.isAbsolute(envPath) ? envPath : path.join(cwd, envPath);
    if (fs.existsSync(absolute)) return absolute;
  }
  const candidates = [
    path.join(cwd, 'service-account.json'),
    path.join(cwd, 'service-account.json.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

async function main() {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 6) {
    console.error('Error: ADMIN_PASSWORD es requerido y debe tener al menos 6 caracteres.');
    console.error('Uso: ADMIN_EMAIL=abengolea1@gmail.com ADMIN_PASSWORD=tucontraseña npx tsx scripts/create-super-admin.ts');
    process.exit(1);
  }

  const credentialsPath = resolveCredentialsPath();
  if (!credentialsPath) {
    console.error('No se encontró la cuenta de servicio.');
    console.error('Descargá service-account.json desde Firebase Console → Configuración del proyecto → Cuentas de servicio.');
    console.error('Ponelo en la raíz del proyecto o definí GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }

  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: projectId || undefined,
      credential: admin.credential.applicationDefault(),
    });
  }

  const auth = admin.auth();
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore(admin.app(), 'default');

  try {
    let user: admin.auth.UserRecord;
    try {
      user = await auth.getUserByEmail(ADMIN_EMAIL);
      console.log(`Usuario existente: ${ADMIN_EMAIL} (uid: ${user.uid})`);
      await auth.updateUser(user.uid, { password: ADMIN_PASSWORD });
      console.log('Contraseña actualizada.');
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'auth/user-not-found') {
        user = await auth.createUser({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          emailVerified: true,
        });
        console.log(`Usuario creado: ${ADMIN_EMAIL} (uid: ${user.uid})`);
      } else {
        throw e;
      }
    }

    await db.collection('platformUsers').doc(user.uid).set(
      {
        email: ADMIN_EMAIL,
        super_admin: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log('Documento platformUsers creado/actualizado con super_admin: true');

    console.log('\n✅ Listo. Podés iniciar sesión en http://localhost:9002/auth/login');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
