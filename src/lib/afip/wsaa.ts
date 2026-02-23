/**
 * WSAA - Web Service de Autenticación y Autorización (AFIP)
 * Usa OpenSSL CLI para firmar el CMS (AFIP solo acepta CMS generado con OpenSSL).
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';

const execAsync = promisify(exec);

const WSAA_URL_HOMO = 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
const WSAA_URL_PROD = 'https://wsaa.afip.gov.ar/ws/services/LoginCms';
const WSAA_URL =
  process.env.AFIP_WSAA_URL ??
  (process.env.AFIP_PRODUCTION === 'true' ? WSAA_URL_PROD : WSAA_URL_HOMO);
const CACHE_TTL_MS = 10 * 60 * 60 * 1000; // 10 horas
const TA_MARGIN_MS = 10 * 60 * 1000; // 10 minutos de margen antes de expiración

let cache: { token: string; sign: string } | null = null;
let cacheExpiry = 0;

/** Ruta del archivo de caché del TA (distinto para homo/prod) */
function getTaFilePath(): string {
  const workDir = path.resolve(process.cwd(), process.env.AFIP_WORK_DIR ?? 'afip');
  const suffix = process.env.AFIP_PRODUCTION === 'true' ? 'prod' : 'homo';
  return path.join(workDir, `ta_wsfe_${suffix}.json`);
}

interface TaCache {
  token: string;
  sign: string;
  expirationTime: string;
}

/** Carga TA desde archivo si existe y es válido (con margen de 10 min) */
function loadCachedTa(): { token: string; sign: string } | null {
  return loadCachedTaWithMargin(TA_MARGIN_MS);
}

/** Carga TA con margen relajado (0 = aceptar hasta el segundo exacto de expiración). Útil cuando AFIP devuelve alreadyAuthenticated. */
function loadCachedTaRelaxed(): { token: string; sign: string } | null {
  return loadCachedTaWithMargin(0);
}

function loadCachedTaWithMargin(marginMs: number): { token: string; sign: string } | null {
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
    return { token: ta.token, sign: ta.sign };
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
  chainPath: string;
  xmlPath: string;
  cmsPath: string;
} {
  const workDir = path.resolve(
    process.cwd(),
    process.env.AFIP_WORK_DIR ?? 'afip'
  );
  const certPath = path.resolve(
    process.cwd(),
    process.env.AFIP_CERT_PATH ?? 'afip/certificado_homo.crt'
  );
  const keyPath = path.resolve(
    process.cwd(),
    process.env.AFIP_KEY_PATH ?? 'afip/privada_homo.key'
  );
  const chainPath = path.resolve(
    process.cwd(),
    process.env.AFIP_CHAIN_PATH ?? 'afip/chain.pem'
  );
  const xmlPath = path.join(workDir, 'loginTicketRequest.xml');
  const cmsPath = path.join(workDir, 'loginTicketRequest.xml.cms');

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
  chainPath: string
): Promise<string> {
  const openssl = getOpenSSLPath();
  console.log('[WSAA] Paso 3: Firmando con OpenSSL...');
  console.log('[WSAA]   OpenSSL:', openssl);
  console.log('[WSAA]   Certificado:', certPath);
  console.log('[WSAA]   Clave:', keyPath);
  console.log('[WSAA]   Chain:', chainPath);

  const cmd = `"${openssl}" smime -sign -signer "${certPath}" -inkey "${keyPath}" -certfile "${chainPath}" -in "${xmlPath}" -out "${cmsPath}" -outform DER -nodetach`;

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
 * Cache: primero archivo (ta_wsfe.json), luego memoria.
 */
export async function getAfipToken(): Promise<{ token: string; sign: string }> {
  // 1) Caché en archivo (reutiliza TA si aún válido, evita coe.alreadyAuthenticated)
  const fileTa = loadCachedTa();
  if (fileTa) return fileTa;

  // 2) Caché en memoria
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
  if (!fs.existsSync(chainPath)) {
    throw new WsaaError(`Archivo chain no encontrado: ${chainPath}`, 'CHAIN_NOT_FOUND');
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

  console.log('[WSAA] Paso 5: Enviando SOAP a', WSAA_URL);
  let response;
  try {
    response = await axios.post(WSAA_URL, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '',
      },
      timeout: 30000,
    });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const responseData = typeof err.response?.data === 'string' ? err.response.data : String(err.response?.data ?? '');
      const isAlreadyAuth =
        responseData.includes('coe.alreadyAuthenticated') ||
        responseData.includes('ya posee un TA valido');

      if (isAlreadyAuth) {
        // AFIP dice que ya hay un TA válido: intentar usar el archivo aunque esté cerca de vencer
        const relaxedTa = loadCachedTaRelaxed();
        if (relaxedTa) {
          console.log('[WSAA] AFIP reportó alreadyAuthenticated; usando TA desde archivo');
          return relaxedTa;
        }
        throw new WsaaError(
          'AFIP: Ya existe un TA válido para este certificado. Esperá ~12h o eliminá afip/ta_wsfe.json si está corrupto.',
          'ALREADY_AUTHENTICATED',
          { response: responseData.slice(0, 500) }
        );
      }
      console.error('[WSAA] Error de conexión:', err.response?.data);
      throw new WsaaError(
        `Error de conexión AFIP: ${err.message}`,
        'CONNECTION_ERROR',
        { code: err.code, response: responseData.slice(0, 500) }
      );
    }
    throw err;
  }

  console.log('[WSAA] Paso 6: Parseando respuesta...');
  const data = typeof response.data === 'string' ? response.data : String(response.data);
  const parsed = parseLoginCmsResponse(data);

  const result = { token: parsed.token, sign: parsed.sign };

  // expirationTime: AFIP lo devuelve en la respuesta; si no, usamos 12h por defecto
  const expirationTime =
    parsed.expirationTime ??
    new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString().replace('Z', '-03:00');

  saveTaToFile({
    token: parsed.token,
    sign: parsed.sign,
    expirationTime,
  });

  cache = result;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
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
