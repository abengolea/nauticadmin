/**
 * WSAA - Web Service de Autenticación y Autorización (AFIP)
 * Usa OpenSSL CLI para firmar el CMS (AFIP solo acepta CMS generado con OpenSSL).
 */

import * as fs from 'fs';
import * as path from 'path';
import https from 'https';
import { constants } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { getActiveAfipSession } from './session';
import { getAfipWorkDir } from './credentials';
import { loadSharedTa, saveSharedTa, type SharedTa } from './ta-store';

/** Agente HTTPS para AFIP producción (usa OPENSSL_CONF=./openssl.cnf con SECLEVEL=0) */
const afipAgent = new https.Agent({
  minVersion: 'TLSv1',
  secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

const execAsync = promisify(exec);

const WSAA_URL_HOMO = 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
const WSAA_URL_PROD = 'https://wsaa.afip.gov.ar/ws/services/LoginCms';

function getWsaaUrl(): string {
  const production = getActiveAfipSession().production;
  return process.env.AFIP_WSAA_URL ?? (production ? WSAA_URL_PROD : WSAA_URL_HOMO);
}
const CACHE_TTL_MS = 10 * 60 * 60 * 1000; // 10 horas
const TA_MARGIN_MS = 10 * 60 * 1000; // 10 minutos de margen antes de expiración

let cache: { token: string; sign: string } | null = null;
let cacheExpiry = 0;

/** Ruta del archivo de caché del TA (distinto para homo/prod) */
function getTaFilePath(): string {
  const session = getActiveAfipSession();
  const workDir = getAfipWorkDir();
  const suffix = session.production ? 'prod' : 'homo';
  return path.join(workDir, `ta_wsfe_${session.cacheKey}_${suffix}.json`);
}

interface TaCache {
  token: string;
  sign: string;
  expirationTime: string;
}

/** Carga TA desde archivo si existe y es válido (con margen de 10 min) */
function loadCachedTa(): TaCache | null {
  return loadCachedTaWithMargin(TA_MARGIN_MS);
}

/** Carga TA con margen relajado (0 = aceptar hasta el segundo exacto de expiración). Útil cuando AFIP devuelve alreadyAuthenticated. */
function loadCachedTaRelaxed(): TaCache | null {
  return loadCachedTaWithMargin(0);
}

function loadCachedTaWithMargin(marginMs: number): TaCache | null {
  const filePath = getTaFilePath();
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const ta: TaCache = JSON.parse(raw);
    if (!ta.token || !ta.sign || !ta.expirationTime) return null;

    const expirationDate = new Date(ta.expirationTime);
    const minValidTime = Date.now() + marginMs;
    if (expirationDate.getTime() <= minValidTime) {
      if (marginMs > 0) console.log('[WSAA] TA en archivo expirado o por vencer, se solicitará uno nuevo');
      return null;
    }

    console.log('[WSAA] Usando TA desde archivo (válido hasta', ta.expirationTime, ')');
    return ta;
  } catch {
    return null;
  }
}

/** Guarda TA en archivo */
function saveTaToFile(ta: TaCache): void {
  const filePath = getTaFilePath();
  const workDir = path.dirname(filePath);
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(ta, null, 2), 'utf8');
  console.log('[WSAA] TA guardado en', filePath);
}

function rememberTa(ta: SharedTa): { token: string; sign: string } {
  cache = { token: ta.token, sign: ta.sign };
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cache;
}

async function persistTa(ta: TaCache): Promise<void> {
  saveTaToFile(ta);
  await saveSharedTa(getActiveAfipSession().production, ta);
}

/** Extrae el cuerpo de un error axios (string, Buffer o view). */
export function axiosErrorBody(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export function isAlreadyAuthenticatedFault(body: string): boolean {
  const n = body.toLowerCase();
  return (
    n.includes('alreadyauthenticated') ||
    n.includes('ya posee un ta valido') ||
    n.includes('ya posee un ta válido')
  );
}

export class WsaaError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'WsaaError';
  }
}

/**
 * Formatea fecha ISO para AFIP: yyyy-mm-ddThh:mm:ss.sss-03:00
 */
function formatAfipDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}-03:00`;
}

/**
 * Genera el XML del TRA (Ticket de Requerimiento de Acceso)
 */
function buildTraXml(): string {
  const now = new Date();
  const genTime = new Date(now.getTime() - 5 * 60 * 1000);
  const expTime = new Date(now.getTime() + 5 * 60 * 1000);
  const uniqueId = Math.floor(Date.now() / 1000);

  return `<loginTicketRequest version="1.0">
    <header>
        <uniqueId>${uniqueId}</uniqueId>
        <generationTime>${formatAfipDate(genTime)}</generationTime>
        <expirationTime>${formatAfipDate(expTime)}</expirationTime>
    </header>
    <service>wsfe</service>
</loginTicketRequest>`;
}

/**
 * Obtiene rutas de certificados y directorio de trabajo
 */
function getPaths(): {
  workDir: string;
  certPath: string;
  keyPath: string;
  chainPath: string | undefined;
  xmlPath: string;
  cmsPath: string;
} {
  const session = getActiveAfipSession();
  const workDir = getAfipWorkDir();
  const certPath = session.certPath;
  const keyPath = session.keyPath;
  const chainPath = session.chainPath;
  const xmlPath = path.join(workDir, `loginTicketRequest_${session.cacheKey}.xml`);
  const cmsPath = path.join(workDir, `loginTicketRequest_${session.cacheKey}.xml.cms`);

  return { workDir, certPath, keyPath, chainPath, xmlPath, cmsPath };
}

/**
 * Resuelve la ruta al ejecutable OpenSSL (Windows puede no tenerlo en PATH)
 */
function getOpenSSLPath(): string {
  const envPath = process.env.AFIP_OPENSSL_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = [
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win32\\bin\\openssl.exe',
    '/usr/bin/openssl',
    '/usr/local/bin/openssl',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'openssl';
}

/**
 * Firma el TRA con OpenSSL y retorna el CMS en base64
 */
async function signWithOpenSSL(
  xmlPath: string,
  cmsPath: string,
  certPath: string,
  keyPath: string,
  chainPath?: string
): Promise<string> {
  const openssl = getOpenSSLPath();
  console.log('[WSAA] Paso 3: Firmando con OpenSSL...');
  console.log('[WSAA]   OpenSSL:', openssl);
  console.log('[WSAA]   Certificado:', certPath);
  console.log('[WSAA]   Clave:', keyPath);
  console.log('[WSAA]   Chain:', chainPath && fs.existsSync(chainPath) ? chainPath : '(omitido)');

  const chainArg =
    chainPath && fs.existsSync(chainPath) ? `-certfile "${chainPath}" ` : '';
  const cmd = `"${openssl}" smime -sign -signer "${certPath}" -inkey "${keyPath}" ${chainArg}-in "${xmlPath}" -out "${cmsPath}" -outform DER -nodetach`;

  try {
    const { stdout, stderr } = await execAsync(cmd);
    if (stdout) console.log('[WSAA] OpenSSL stdout:', stdout);
    if (stderr) console.log('[WSAA] OpenSSL stderr:', stderr);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WSAA] Error OpenSSL:', msg);
    throw new WsaaError(
      `Error al firmar con OpenSSL: ${msg}`,
      'OPENSSL_ERROR',
      err
    );
  }

  if (!fs.existsSync(cmsPath)) {
    throw new WsaaError('OpenSSL no generó el archivo CMS', 'OPENSSL_ERROR');
  }

  console.log('[WSAA] Paso 4: Convirtiendo CMS a base64...');
  const cmsBuffer = fs.readFileSync(cmsPath);
  return cmsBuffer.toString('base64');
}

/**
 * Decodifica entidades HTML en el XML devuelto por AFIP (loginCmsReturn viene HTML-encoded)
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Extrae token, sign y expirationTime de la respuesta SOAP.
 * AFIP devuelve el XML del TA HTML-encoded dentro de loginCmsReturn (&lt; en lugar de <, etc.).
 * Exportado para tests.
 */
export function parseLoginCmsResponse(xml: string): { token: string; sign: string; expirationTime?: string } {
  // Extraer contenido de loginCmsReturn (con o sin namespace: wsaa:loginCmsReturn, ns1:loginCmsReturn, etc.)
  const loginCmsReturnMatch = xml.match(/<[^>]*loginCmsReturn[^>]*>([\s\S]*?)<\/[^>]*loginCmsReturn>/i);
  let xmlToParse = xml;
  if (loginCmsReturnMatch) {
    const encodedContent = loginCmsReturnMatch[1].trim();
    xmlToParse = decodeHtmlEntities(encodedContent);
  } else if (xml.includes('&lt;') || xml.includes('&gt;')) {
    // Fallback: si no hay loginCmsReturn pero el XML está escapado, decodificar todo
    xmlToParse = decodeHtmlEntities(xml);
  }

  const tokenMatch = xmlToParse.match(/<token>([\s\S]*?)<\/token>/);
  const signMatch = xmlToParse.match(/<sign>([\s\S]*?)<\/sign>/);
  const expMatch = xmlToParse.match(/<expirationTime>([^<]+)<\/expirationTime>/);

  if (!tokenMatch) {
    const errMatch = xml.match(/<faultstring>([^<]*)<\/faultstring>/);
    const msg = errMatch ? errMatch[1] : 'No se encontró token en la respuesta';
    throw new WsaaError(`Error SOAP: ${msg}`, 'SOAP_ERROR', { xml: xml.slice(0, 500) });
  }
  if (!signMatch) {
    throw new WsaaError('No se encontró sign en la respuesta AFIP', 'SOAP_ERROR');
  }

  return {
    token: tokenMatch[1].trim(),
    sign: signMatch[1].trim(),
    expirationTime: expMatch ? expMatch[1].trim() : undefined,
  };
}

/**
 * Obtiene token WSAA para AFIP usando OpenSSL.
 * Cache: archivo local → Firestore (compartido con App Hosting) → memoria → loginCms.
 */
export async function getAfipToken(): Promise<{ token: string; sign: string }> {
  const production = getActiveAfipSession().production;

  // 1) Caché en archivo (reutiliza TA si aún válido, evita coe.alreadyAuthenticated)
  const fileTa = loadCachedTa();
  if (fileTa) {
    void saveSharedTa(production, fileTa);
    return rememberTa(fileTa);
  }

  // 2) Caché compartida (App Hosting no ve C:\secure\afip\cache)
  const remoteTa = await loadSharedTa(production, TA_MARGIN_MS);
  if (remoteTa) {
    saveTaToFile(remoteTa);
    return rememberTa(remoteTa);
  }

  // 3) Caché en memoria
  if (cache && Date.now() < cacheExpiry) {
    console.log('[WSAA] Usando token en caché (válido por 10 horas)');
    return cache;
  }

  const { workDir, certPath, keyPath, chainPath, xmlPath, cmsPath } = getPaths();

  if (!fs.existsSync(certPath)) {
    throw new WsaaError(`Certificado no encontrado: ${certPath}`, 'CERT_NOT_FOUND');
  }
  if (!fs.existsSync(keyPath)) {
    throw new WsaaError(`Clave privada no encontrada: ${keyPath}`, 'KEY_NOT_FOUND');
  }
  console.log('[WSAA] Paso 1: Generando loginTicketRequest.xml...');
  const traXml = buildTraXml();

  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
    console.log('[WSAA] Directorio creado:', workDir);
  }

  console.log('[WSAA] Paso 2: Guardando XML en', xmlPath);
  fs.writeFileSync(xmlPath, traXml, 'utf8');

  const cmsBase64 = await signWithOpenSSL(xmlPath, cmsPath, certPath, keyPath, chainPath);

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
   <soapenv:Body>
      <wsaa:loginCms>
         <wsaa:in0>${cmsBase64}</wsaa:in0>
      </wsaa:loginCms>
   </soapenv:Body>
</soapenv:Envelope>`;

  const wsaaUrl = getWsaaUrl();
  const isProduction = getActiveAfipSession().production;
  console.log('[WSAA] Paso 5: Enviando SOAP a', wsaaUrl);
  let response;
  try {
    response = await axios.post(wsaaUrl, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '',
      },
      timeout: 30000,
      httpsAgent: isProduction ? afipAgent : undefined,
    });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const responseData = axiosErrorBody(err.response?.data);
      if (isAlreadyAuthenticatedFault(responseData)) {
        const fileRelaxed = loadCachedTaRelaxed();
        const relaxedTa = fileRelaxed ?? (await loadSharedTa(production, 0));
        if (relaxedTa) {
          console.log('[WSAA] AFIP reportó alreadyAuthenticated; reutilizando TA en caché');
          if (!fileRelaxed) saveTaToFile(relaxedTa);
          return rememberTa(relaxedTa);
        }
        throw new WsaaError(
          'AFIP ya tiene un ticket vigente para este certificado (pedido desde otra máquina). El servidor no lo tiene en caché: hay que compartir el TA o esperar a que venza (~12h).',
          'ALREADY_AUTHENTICATED',
          { response: responseData.slice(0, 500) }
        );
      }
      const fault = responseData.match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i)?.[1];
      console.error('[WSAA] Error de conexión:', fault ?? responseData.slice(0, 300));
      throw new WsaaError(
        fault
          ? `Error AFIP: ${fault}`
          : `Error de conexión AFIP: ${err.message}`,
        'CONNECTION_ERROR',
        { code: err.code, status: err.response?.status, response: responseData.slice(0, 500) }
      );
    }
    throw err;
  }

  console.log('[WSAA] Paso 6: Parseando respuesta...');
  const data = axiosErrorBody(response.data);
  const parsed = parseLoginCmsResponse(data);

  const result = { token: parsed.token, sign: parsed.sign };

  // expirationTime: AFIP lo devuelve en la respuesta; si no, usamos 12h por defecto
  const expirationTime =
    parsed.expirationTime ??
    new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString().replace('Z', '-03:00');

  const ta: TaCache = {
    token: parsed.token,
    sign: parsed.sign,
    expirationTime,
  };
  await persistTa(ta);
  rememberTa(ta);
  console.log('[WSAA] Token obtenido y guardado (válido hasta', expirationTime, ')');

  return result;
}

/** Alias para compatibilidad con código existente */
export async function getWsaaToken(service?: string): Promise<{ token: string; sign: string; expiration: string }> {
  const result = await getAfipToken();
  return {
    ...result,
    expiration: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
  };
}
