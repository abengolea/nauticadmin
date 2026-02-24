/**
 * WSFE - Web Service de Facturación Electrónica (AFIP)
 * Llamadas SOAP directas a AFIP, sin dependencias externas.
 * Usa getAfipToken() de wsaa.ts para autenticación.
 */
import './tls-patch'; // primer import (parche DH para AFIP prod)

import https from 'https';
import { constants } from 'crypto';
import axios from 'axios';
import { getAfipToken } from './wsaa';

/** Agente HTTPS para AFIP producción (usa OPENSSL_CONF=./openssl.cnf con SECLEVEL=0) */
const afipAgent = new https.Agent({
  minVersion: 'TLSv1',
  secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

const WSFE_URL_HOMO = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';
const WSFE_URL_PROD = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx';
const NS = 'http://ar.gov.afip.dif.FEV1/';

function getWsfeUrl(): string {
  const production = String(process.env.AFIP_PRODUCTION ?? '').trim().toLowerCase() === 'true';
  return production ? WSFE_URL_PROD : WSFE_URL_HOMO;
}

/** Formato fecha AFIP: yyyymmdd */
function toAfipDate(d: Date): number {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return parseInt(`${y}${m}${day}`, 10);
}

/** Formato fecha AFIP a yyyy-mm-dd */
function formatDate(afipDate: string | number): string {
  const s = String(afipDate);
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Construye el cuerpo SOAP 1.2 para una operación WSFE
 */
function buildSoapBody(operation: string, content: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <${operation} xmlns="${NS}">
      ${content}
    </${operation}>
  </soap12:Body>
</soap12:Envelope>`;
}

/**
 * Extrae el resultado de la respuesta SOAP
 */
function parseSoapResponse<T>(xml: string, resultTag: string): T {
  const data = typeof xml === 'string' ? xml : String(xml);

  // SOAP Fault
  const faultMatch = data.match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i);
  if (faultMatch) {
    throw new Error(`AFIP SOAP: ${faultMatch[1].trim()}`);
  }

  // Resultado (soporta namespace en closing tag, ej: </ns1:FECAESolicitarResult>)
  const match = data.match(new RegExp(`<${resultTag}[^>]*>([\\s\\S]*?)</[^:>]*:?${resultTag}>`));
  if (!match) {
    throw new Error('AFIP SOAP: Respuesta inválida - no se encontró resultado');
  }
  return match[1] as unknown as T;
}

/**
 * Ejecuta una operación SOAP en WSFE
 */
async function executeSoap<T>(operation: string, content: string): Promise<string> {
  const { token, sign } = await getAfipToken();
  const cuit = process.env.AFIP_CUIT?.replace(/\D/g, '');
  if (!cuit) throw new Error('AFIP_CUIT no configurado');

  const authBlock = `
      <Auth>
        <Token>${escapeXml(token)}</Token>
        <Sign>${escapeXml(sign)}</Sign>
        <Cuit>${cuit}</Cuit>
      </Auth>`;

  const fullContent = authBlock + '\n' + content;
  const body = buildSoapBody(operation, fullContent);

  const url = getWsfeUrl();
  const isProduction = String(process.env.AFIP_PRODUCTION ?? '').trim().toLowerCase() === 'true';
  const response = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8',
    },
    timeout: 30000,
    httpsAgent: isProduction ? afipAgent : undefined,
  });

  const responseData = typeof response.data === 'string' ? response.data : String(response.data);
  const resultTag = operation + 'Result';
  return parseSoapResponse<string>(responseData, resultTag);
}

/**
 * Obtiene las condiciones IVA del receptor (para Factura B)
 */
export async function getCondicionIvaReceptor(claseCmp?: string): Promise<Array<{ Id: number; Desc: string }>> {
  const content = claseCmp ? `<ClaseCmp>${escapeXml(claseCmp)}</ClaseCmp>` : '';
  const resultXml = await executeSoap('FEParamGetCondicionIvaReceptor', content);
  const items: Array<{ Id: number; Desc: string }> = [];
  const regex = /<CondicionIvaReceptor>[\s\S]*?<Id>(\d+)<\/Id>[\s\S]*?<Desc>([^<]*)<\/Desc>/g;
  let m;
  while ((m = regex.exec(resultXml)) !== null) {
    items.push({ Id: parseInt(m[1], 10), Desc: m[2] });
  }
  return items;
}

/**
 * Obtiene el último comprobante autorizado
 */
export async function getLastVoucher(ptoVta: number, cbteTipo: number): Promise<number> {
  const content = `
      <PtoVta>${ptoVta}</PtoVta>
      <CbteTipo>${cbteTipo}</CbteTipo>`;

  const resultXml = await executeSoap('FECompUltimoAutorizado', content);

  const cbteNroMatch = resultXml.match(/<CbteNro>(\d+)<\/CbteNro>/);
  if (!cbteNroMatch) {
    const errMatch = resultXml.match(/<Err><Code>(\d+)<\/Code><Msg>([^<]*)<\/Msg><\/Err>/);
    if (errMatch) {
      throw new Error(`AFIP (${errMatch[1]}): ${errMatch[2]}`);
    }
    throw new Error('AFIP: No se obtuvo CbteNro en FECompUltimoAutorizado');
  }

  return parseInt(cbteNroMatch[1], 10);
}

/** Alicuota IVA: Id 5 = 21%, Id 4 = 10.5%, Id 6 = 27% */
export interface AlicIva {
  Id: number;
  BaseImp: number;
  Importe: number;
}

/** Condición IVA receptor: 5=Consumidor Final, 1=Responsable Inscripto, 6=Monotributista, etc. */
export interface CreateVoucherParams {
  PtoVta: number;
  CbteTipo: number;
  Concepto: number;
  DocTipo: number;
  DocNro: number;
  /** Condición frente al IVA del receptor (RG 5616). 5=Consumidor Final, 1=RI, 6=Monotributo */
  CondIVAReceptor?: number;
  CbteDesde: number;
  CbteHasta: number;
  CbteFch: number;
  ImpTotal: number;
  ImpTotConc: number;
  ImpNeto: number;
  ImpOpEx: number;
  ImpIVA: number;
  ImpTrib: number;
  MonId: string;
  MonCotiz: number;
  FchServDesde?: number;
  FchServHasta?: number;
  FchVtoPago?: number;
  /** Para Factura B/C con IVA: alícuotas (ej. Id 5 = 21%) */
  Iva?: AlicIva[];
}

/**
 * Solicita CAE para un comprobante (FECAESolicitar)
 */
export async function createVoucher(params: CreateVoucherParams): Promise<{ CAE: string; CAEFchVto: string }> {
  const cantReg = params.CbteHasta - params.CbteDesde + 1;

  // Para Concepto 2 (Servicios) y 3, AFIP requiere FchServDesde y FchServHasta
  const fecha = params.CbteFch;
  const fchServDesde = params.FchServDesde ?? fecha;
  const fchServHasta = params.FchServHasta ?? fecha;
  const fchVtoPago = params.FchVtoPago ?? fecha;

  const ivaBlock =
    params.Iva && params.Iva.length > 0
      ? `
          <Iva>
            ${params.Iva.map((a) => `<AlicIva><Id>${a.Id}</Id><BaseImp>${a.BaseImp}</BaseImp><Importe>${a.Importe}</Importe></AlicIva>`).join('\n            ')}
          </Iva>`
      : '';

  const condIvaReceptor = params.CondIVAReceptor ?? 5; // 5 = Consumidor Final (RG 5616)
  const det = `
        <FECAEDetRequest>
          <Concepto>${params.Concepto}</Concepto>
          <DocTipo>${params.DocTipo}</DocTipo>
          <DocNro>${params.DocNro}</DocNro>
          <CbteDesde>${params.CbteDesde}</CbteDesde>
          <CbteHasta>${params.CbteHasta}</CbteHasta>
          <CbteFch>${params.CbteFch}</CbteFch>
          <ImpTotal>${params.ImpTotal}</ImpTotal>
          <ImpTotConc>${params.ImpTotConc}</ImpTotConc>
          <ImpNeto>${params.ImpNeto}</ImpNeto>
          <ImpOpEx>${params.ImpOpEx}</ImpOpEx>
          <ImpIVA>${params.ImpIVA}</ImpIVA>
          <ImpTrib>${params.ImpTrib}</ImpTrib>
          <MonId>${params.MonId}</MonId>
          <MonCotiz>${params.MonCotiz}</MonCotiz>
          <FchServDesde>${fchServDesde}</FchServDesde>
          <FchServHasta>${fchServHasta}</FchServHasta>
          <FchVtoPago>${fchVtoPago}</FchVtoPago>
          <CondicionIVAReceptorId>${condIvaReceptor}</CondicionIVAReceptorId>${ivaBlock}
        </FECAEDetRequest>`;

  const content = `
      <FeCAEReq>
        <FeCabReq>
          <CantReg>${cantReg}</CantReg>
          <PtoVta>${params.PtoVta}</PtoVta>
          <CbteTipo>${params.CbteTipo}</CbteTipo>
        </FeCabReq>
        <FeDetReq>
          ${det}
        </FeDetReq>
      </FeCAEReq>`;

  const resultXml = await executeSoap('FECAESolicitar', content);

  // Verificar errores en Errors
  const errMatch = resultXml.match(/<Errors>[\s\S]*?<Err><Code>(\d+)<\/Code><Msg>([^<]*)<\/Msg><\/Err>/);
  if (errMatch) {
    throw new Error(`AFIP (${errMatch[1]}): ${errMatch[2]}`);
  }

  // Verificar Observaciones (cuando Resultado=R, el CAE no viene)
  const obsMatch = resultXml.match(/<Observaciones>[\s\S]*?<Obs><Code>(\d+)<\/Code><Msg>([^<]*)<\/Msg><\/Obs>/);
  if (obsMatch) {
    throw new Error(`AFIP (${obsMatch[1]}): ${obsMatch[2]}`);
  }

  const caeMatch = resultXml.match(/<CAE>([^<]+)<\/CAE>/);
  const caeVtoMatch = resultXml.match(/<CAEFchVto>([^<]+)<\/CAEFchVto>/);

  if (!caeMatch || !caeVtoMatch) {
    const errDetail = resultXml.match(/<Err><Code>(\d+)<\/Code><Msg>([^<]*)<\/Msg><\/Err>/);
    const msg = errDetail ? `AFIP (${errDetail[1]}): ${errDetail[2]}` : `AFIP: No se obtuvo CAE en FECAESolicitar. Respuesta: ${resultXml.slice(0, 500)}`;
    throw new Error(msg);
  }

  return {
    CAE: caeMatch[1].trim(),
    CAEFchVto: formatDate(caeVtoMatch[1].trim()),
  };
}

/**
 * Crea el siguiente comprobante (getLastVoucher + 1, luego createVoucher)
 */
export async function createNextVoucher(params: Omit<CreateVoucherParams, 'CbteDesde' | 'CbteHasta'>): Promise<{
  voucherNumber: number;
  CAE: string;
  CAEFchVto: string;
}> {
  const lastVoucher = await getLastVoucher(params.PtoVta, params.CbteTipo);
  const voucherNumber = lastVoucher + 1;

  const result = await createVoucher({
    ...params,
    CbteDesde: voucherNumber,
    CbteHasta: voucherNumber,
  });

  return {
    voucherNumber,
    CAE: result.CAE,
    CAEFchVto: result.CAEFchVto,
  };
}
