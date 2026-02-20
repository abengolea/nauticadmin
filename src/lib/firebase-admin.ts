/**
 * Firebase Admin SDK - SOLO para uso en servidor (API routes, server actions, Cloud Functions).
 * NO importar en código cliente.
 */

import path from 'path';
import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

let adminApp: App;

function resolveCredentialsPath(): string | undefined {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!envPath?.trim()) return undefined;
  // Si es ruta relativa (./ o sin drive en Windows), resolver desde la raíz del proyecto
  const isRelative = envPath.startsWith('./') || envPath.startsWith('.\\') || (!path.isAbsolute(envPath) && !envPath.includes(':'));
  if (isRelative) {
    const resolved = path.resolve(process.cwd(), envPath.replace(/^\.[/\\]/, ''));
    return resolved;
  }
  return envPath;
}

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0] as App;
  }
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is required for firebase-admin');
  }
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`;
  const credentialsPath = resolveCredentialsPath();
  if (credentialsPath) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  }
  // En local: GOOGLE_APPLICATION_CREDENTIALS o default credentials
  // En producción (App Hosting / Cloud Functions): Application Default Credentials
  adminApp = initializeApp({ projectId, storageBucket });
  return adminApp;
}

export function getAdminFirestore() {
  // Usar la base de datos por defecto (default) - igual que el cliente
  return getFirestore(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminStorage() {
  return getStorage(getAdminApp());
}
