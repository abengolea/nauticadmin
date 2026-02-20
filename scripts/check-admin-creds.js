/**
 * Script rápido para verificar que Firebase Admin puede cargar las credenciales.
 * No expone claves, solo comprueba que el archivo existe y tiene la estructura correcta.
 * Ejecutar: node scripts/check-admin-creds.js
 */
require('dotenv').config({ path: '.env.local' });
const path = require('path');
const fs = require('fs');

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
console.log('GOOGLE_APPLICATION_CREDENTIALS:', credPath || '(no definida)');

if (!credPath) {
  console.log('❌ No está definida. Agregá GOOGLE_APPLICATION_CREDENTIALS a .env.local');
  process.exit(1);
}

const resolved = credPath.startsWith('./') || credPath.startsWith('.\\')
  ? path.resolve(process.cwd(), credPath.replace(/^\.\//, '').replace(/^\.\\/, ''))
  : credPath;

console.log('Ruta resuelta:', resolved);

if (!fs.existsSync(resolved)) {
  console.log('❌ El archivo no existe en esa ruta.');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
} catch (e) {
  console.log('❌ Error al leer JSON:', e.message);
  process.exit(1);
}

const hasKey = !!data.private_key;
const hasEmail = !!data.client_email;
const hasProject = !!data.project_id;

if (!hasKey || !hasEmail) {
  console.log('❌ El JSON no tiene la estructura esperada (private_key, client_email).');
  process.exit(1);
}

console.log('✅ Archivo OK. project_id:', data.project_id || '(no)');
console.log('✅ client_email:', data.client_email?.substring(0, 30) + '...');

// Intentar inicializar Firebase Admin
console.log('\nInicializando Firebase Admin...');
try {
  const admin = require('firebase-admin');
  if (admin.apps.length === 0) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = resolved;
    admin.initializeApp({ projectId: data.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  }
  const auth = admin.auth();
  console.log('✅ Firebase Admin inicializado correctamente.');
  process.exit(0);
} catch (e) {
  console.log('❌ Error al inicializar Admin:', e.message);
  process.exit(1);
}
