/**
 * Credenciales AFIP en App Hosting / Cloud Run.
 * Local: archivos en disco (AFIP_CERT_PATH).
 * Producción: secrets AFIP_CERT_PEM / AFIP_KEY_PEM materializados en /tmp.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function isCloudRun(): boolean {
  return Boolean(process.env.K_SERVICE || process.env.K_REVISION);
}

export function getAfipWorkDir(): string {
  if (process.env.AFIP_WORK_DIR) {
    return path.resolve(process.env.AFIP_WORK_DIR);
  }
  if (isCloudRun()) {
    return path.join(os.tmpdir(), 'afip');
  }
  return path.resolve(process.cwd(), 'afip');
}

export function getFacturasDir(): string {
  if (isCloudRun() || process.env.AFIP_WORK_DIR) {
    return path.join(getAfipWorkDir(), 'facturas');
  }
  return path.resolve(process.cwd(), 'facturas');
}

export function normalizePem(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.includes('\\n') && !trimmed.includes('\n')) {
    return `${trimmed.replace(/\\n/g, '\n')}\n`;
  }
  return `${trimmed}\n`;
}

function writePem(dest: string, pem: string | undefined): string | undefined {
  if (!pem?.trim()) return undefined;
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dest, normalizePem(pem), { encoding: 'utf8', mode: 0o600 });
  return dest;
}

export function materializeAfipCredentials(): {
  certPath?: string;
  keyPath?: string;
  chainPath?: string;
  workDir: string;
} {
  const workDir = getAfipWorkDir();
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
  }

  return {
    certPath: writePem(path.join(workDir, 'certificado.crt'), process.env.AFIP_CERT_PEM),
    keyPath: writePem(path.join(workDir, 'privada.key'), process.env.AFIP_KEY_PEM),
    chainPath: writePem(path.join(workDir, 'chain.pem'), process.env.AFIP_CHAIN_PEM),
    workDir,
  };
}

function firstExisting(candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function resolveExistingPath(
  explicit: string | undefined,
  envPath: string | undefined,
  materialized: string | undefined,
  fallback: string
): string {
  const resolved = firstExisting([
    explicit,
    envPath,
    materialized,
    fallback,
  ]);
  if (!resolved) {
    throw new Error(
      'Certificados AFIP de Notificas SRL no disponibles. En App Hosting configurá AFIP_CERT_PEM y AFIP_KEY_PEM.'
    );
  }
  return resolved;
}
