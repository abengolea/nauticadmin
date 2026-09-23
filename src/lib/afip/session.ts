/**
 * Contexto AFIP por náutica.
 *
 * Modelo delegación ARCA (Opción A):
 * - Certificados (.crt/.key): NOTIFICAS SRL (delegado / operador técnico)
 * - CUIT en WSFE: emisor fiscal de la náutica (ej. Yaguaron SA), desde school.facturacion
 * - La autorización del mandante se da en ARCA → Administrador de relaciones de clave fiscal
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  materializeAfipCredentials,
  resolveExistingPath,
} from './credentials';

export interface AfipSession {
  /** CUIT emisor fiscal (delegante), solo dígitos — va en el Auth de WSFE */
  cuit: string;
  /** Certificados del delegado (Notificas SRL) para WSAA */
  certPath: string;
  keyPath: string;
  chainPath: string;
  production: boolean;
  /** Caché de TA WSAA: por certificado delegado, no por CUIT emisor */
  cacheKey: string;
}

let activeSession: AfipSession | null = null;

export function getActiveAfipSession(): AfipSession {
  return activeSession ?? resolveAfipSessionFromEnv();
}

export async function runWithAfipSession<T>(
  session: AfipSession,
  fn: () => Promise<T>
): Promise<T> {
  const prev = activeSession;
  activeSession = session;
  try {
    return await fn();
  } finally {
    activeSession = prev;
  }
}

function resolvePath(relativeOrAbsolute: string): string {
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(process.cwd(), relativeOrAbsolute);
}

function cacheKeyFromCert(certPath: string): string {
  const base = path.basename(certPath, path.extname(certPath));
  return base.replace(/\W/g, '_') || 'afip';
}

export function resolveAfipSessionFromEnv(): AfipSession {
  const cuit = (process.env.AFIP_CUIT ?? '').replace(/\D/g, '');
  if (!cuit) {
    throw new Error('AFIP_CUIT no configurado');
  }
  const production =
    String(process.env.AFIP_PRODUCTION ?? '').trim().toLowerCase() === 'true';
  const materialized = materializeAfipCredentials();
  const certPath = resolveExistingPath(
    undefined,
    process.env.AFIP_CERT_PATH ? resolvePath(process.env.AFIP_CERT_PATH) : undefined,
    materialized.certPath,
    resolvePath(production ? 'afip/certificado_prod.crt' : 'afip/certificado_homo.crt')
  );
  const keyPath = resolveExistingPath(
    undefined,
    process.env.AFIP_KEY_PATH ? resolvePath(process.env.AFIP_KEY_PATH) : undefined,
    materialized.keyPath,
    resolvePath(production ? 'afip/privada_prod.key' : 'afip/privada_homo.key')
  );
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error(
      'Certificados AFIP de Notificas SRL no disponibles. En App Hosting configurá AFIP_CERT_PEM y AFIP_KEY_PEM.'
    );
  }
  return {
    cuit,
    certPath,
    keyPath,
    chainPath:
      materialized.chainPath ??
      resolvePath(process.env.AFIP_CHAIN_PATH ?? 'afip/chain.pem'),
    production,
    cacheKey: cacheKeyFromCert(certPath),
  };
}

/** Certificados del delegado (env); CUIT emisor = school.facturacion (delegante) */
export function resolveAfipSessionForSchool(facturacion: {
  cuit: string;
  afipCertPath?: string;
  afipKeyPath?: string;
  afipChainPath?: string;
  afipProduction?: boolean;
}): AfipSession {
  const cuit = facturacion.cuit.replace(/\D/g, '');
  if (cuit.length !== 11) {
    throw new Error(`CUIT emisor inválido: ${facturacion.cuit}`);
  }
  const production =
    facturacion.afipProduction ??
    String(process.env.AFIP_PRODUCTION ?? '').trim().toLowerCase() === 'true';
  const materialized = materializeAfipCredentials();

  const certPath = resolveExistingPath(
    facturacion.afipCertPath ? resolvePath(facturacion.afipCertPath) : undefined,
    process.env.AFIP_CERT_PATH ? resolvePath(process.env.AFIP_CERT_PATH) : undefined,
    materialized.certPath,
    resolvePath(production ? 'afip/certificado_prod.crt' : 'afip/certificado_homo.crt')
  );
  const keyPath = resolveExistingPath(
    facturacion.afipKeyPath ? resolvePath(facturacion.afipKeyPath) : undefined,
    process.env.AFIP_KEY_PATH ? resolvePath(process.env.AFIP_KEY_PATH) : undefined,
    materialized.keyPath,
    resolvePath(production ? 'afip/privada_prod.key' : 'afip/privada_homo.key')
  );
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error(
      'Certificados AFIP de Notificas SRL no disponibles. En App Hosting configurá AFIP_CERT_PEM y AFIP_KEY_PEM.'
    );
  }

  return {
    cuit,
    certPath,
    keyPath,
    chainPath:
      (facturacion.afipChainPath
        ? resolvePath(facturacion.afipChainPath)
        : undefined) ??
      materialized.chainPath ??
      resolvePath(
        process.env.AFIP_CHAIN_PATH ??
          (production ? 'afip/chain_prod.pem' : 'afip/chain.pem')
      ),
    production,
    cacheKey: cacheKeyFromCert(certPath),
  };
}
