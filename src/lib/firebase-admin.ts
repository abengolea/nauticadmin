/**
 * Firebase Admin SDK - SOLO para uso en servidor (API routes, server actions, Cloud Functions).
 * NO importar en código cliente.
 */

import fs from 'fs';
import path from 'path';
import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
  type App,
} from 'firebase-admin/app';
import type { ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

export const FIREBASE_ADMIN_CREDENTIALS_ERROR =
  'Firebase Admin no está configurado en local. Descargá service-account.json desde Firebase Console → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada, y guardalo en la raíz del proyecto. Verificá con: node scripts/check-admin-creds.js';

let adminApp: App;

function resolveFilePath(filePath: string): string {
  const isRelative =
    filePath.startsWith('./') ||
    filePath.startsWith('.\\') ||
    (!path.isAbsolute(filePath) && !filePath.includes(':'));
  if (isRelative) {
    return path.resolve(process.cwd(), filePath.replace(/^\.[/\\]/, ''));
  }
  return filePath;
}

function loadServiceAccountFromFile(filePath: string): ServiceAccount | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw) as ServiceAccount;
    if (!data.private_key || !data.client_email) return null;
    return data;
  } catch {
    return null;
  }
}

function loadServiceAccount(): ServiceAccount | null {
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonEnv) {
    try {
      const data = JSON.parse(jsonEnv) as ServiceAccount;
      if (data.private_key && data.client_email) return data;
    } catch {
      // seguir con archivo
    }
  }

  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (envPath) {
    const fromEnv = loadServiceAccountFromFile(resolveFilePath(envPath));
    if (fromEnv) return fromEnv;
  }

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'service-account.json'),
    path.join(cwd, 'service-account.json.json'),
  ];
  for (const candidate of candidates) {
    const account = loadServiceAccountFromFile(candidate);
    if (account) return account;
  }

  return null;
}

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0] as App;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is required for firebase-admin');
  }

  const storageBucket =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`;

  const serviceAccount = loadServiceAccount();

  if (serviceAccount) {
    adminApp = initializeApp({
      projectId,
      storageBucket,
      credential: cert(serviceAccount),
    });
    return adminApp;
  }

  // Producción (App Hosting / Cloud Functions): Application Default Credentials
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    adminApp = initializeApp({
      projectId,
      storageBucket,
      credential: applicationDefault(),
    });
    return adminApp;
  }

  throw new Error(FIREBASE_ADMIN_CREDENTIALS_ERROR);
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminStorage() {
  return getStorage(getAdminApp());
}
