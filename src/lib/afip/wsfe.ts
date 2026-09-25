/**
 * WSFE - Web Service de Facturación Electrónica (ARCA)
 * Manual referencia: WSFEv1 RG 4291 FE v4.8 (Sep 2026)
 * @see https://www.arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf
 */
import './tls-patch';

import https from 'https';
import { constants } from 'crypto';
import axios from 'axios';
import { getAfipToken } from './wsaa';
import { getActiveAfipSession } from './session';
import { sanitizeFiscalXml } from '@/lib/fiscal/sanitize';

const afipAgent = new https.Agent({
  minVersion: 'TLSv1',
  secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

const WSFE_URL_HOMO = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';
const WSFE_URL_PROD = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx';
const NS = 'http://ar.gov.afip.dif.FEV1/';

function getWsfeUrl(): string {
  return getActiveAfipSession().production ? WSFE_URL_PROD : WSFE_URL_HOMO;
}

export function formatAfipDateIso(afipDate: string | number): string {
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

function parseSoapResponse(xml: string, resultTag: string): string {
  const data = typeof xml === 'string' ? xml : String(xml);
  const faultMatch = data.match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i);
  if (faultMatch) {
    throw new Error(`AFIP SOAP: ${faultMatch[1].trim()}`);
  }
  const match = data.match(new RegExp(`<${resultTag}[^>]*>([\\s\\S]*?)</[^:>]*:?${resultTag}>`));
  if (!match) {
    throw new Error('AFIP SOAP: Respuesta inválida - no se encontró resultado');
  }
  return match[1];
}

function parseErrObsBlocks(xml: string): {
  errores: Array<{ code: number; msg: string }>;
  observaciones: Array<{ code: number; msg: string }>;
} {
  const errores: Array<{ code: number; msg: string }> = [];
  const observaciones: Array<{ code: number; msg: string }> = [];
  const errRegex = /<Err>[\s\S]*?<Code>(\d+)<\/Code>[\s\S]*?<Msg>([^<]*)<\/Msg>[\s\S]*?<\/Err>/g;
  const obsRegex = /<Obs>[\s\S]*?<Code>(\d+)<\/Code>[\s\S]*?<Msg>([^<]*)<\/Msg>[\s\S]*?<\/Obs>/g;
  let m;
  while ((m = errRegex.exec(xml)) !== null) {
    errores.push({ code: parseInt(m[1], 10), msg: m[2].trim() });
  }
  while ((m = obsRegex.exec(xml)) !== null) {
    observaciones.push({ code: parseInt(m[1], 10), msg: m[2].trim() });
  }
  return { errores, observaciones };
}

async function executeSoap(operation: string, content: string): Promise<string> {
  const { token, sign } = await getAfipToken();
  const cuit = getActiveAfipSession().cuit;
  if (!cuit) throw new Error('CUIT emisor AFIP no configurado');

  const authBlock = `
      <Auth>
        <Token>${escapeXml(token)}</Token>
        <Sign>${escapeXml(sign)}</Sign>
        <Cuit>${cuit}</Cuit>
      </Auth>`;

  const body = buildSoapBody(operation, authBlock + '\n' + content);
  const isProduction = getActiveAfipSession().production;

  const response = await axios.post(getWsfeUrl(), body, {
    headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
    timeout: 30000,
    httpsAgent: isProduction ? afipAgent : undefined,
  });

  const responseData = typeof response.data === 'string' ? response.data : String(response.data);
  return parseSoapResponse(responseData, operation + 'Result');
}

export interface CondicionIvaReceptorRow {
  Id: number;
  Desc: string;
  Cmp_Clase?: string;
}

export async function getCondicionIvaReceptor(claseCmp?: string): Promise<CondicionIvaReceptorRow[]> {
  const content = claseCmp ? `<ClaseCmp>${escapeXml(claseCmp)}</ClaseCmp>` : '';
  const resultXml = await executeSoap('FEParamGetCondicionIvaReceptor', content);
  const items: CondicionIvaReceptorRow[] = [];
  const regex =
    /<CondicionIvaReceptor>[\s\S]*?<Id>(\d+)<\/Id>[\s\S]*?<Desc>([^<]*)<\/Desc>(?:[\s\S]*?<Cmp_Clase>([^<]*)<\/Cmp_Clase>)?/g;
  let m;
  while ((m = regex.exec(resultXml)) !== null) {
    items.push({ Id: parseInt(m[1], 10), Desc: m[2], Cmp_Clase: m[3] });
  }
  return items;
}

export async function getCotizacion(monId: string, monFecha?: string): Promise<number> {
  const fechaBlock = monFecha ? `<FchCotiz>${escapeXml(monFecha)}</FchCotiz>` : '';
  const content = `<MonId>${escapeXml(monId)}</MonId>${fechaBlock}`;
  const resultXml = await executeSoap('FEParamGetCotizacion', content);
  const errMatch = resultXml.match(/<Errors>[\s\S]*?<Err><Code>(\d+)<\/Code><Msg>([^<]*)<\/Msg><\/Err>/);
  if (errMatch) {
    throw new Error(`AFIP cotización (${errMatch[1]}): ${errMatch[2]}`);
  }
  const cotMatch = resultXml.match(/<MonCotiz>([\d.]+)<\/MonCotiz>/);
  if (!cotMatch) {
    throw new Error(`AFIP: No se obtuvo cotización para ${monId}`);
  }
  return parseFloat(cotMatch[1]);
}

export async function getLastVoucher(ptoVta: number, cbteTipo: number): Promise<number> {
  const content = `
      <PtoVta>${ptoVta}</PtoVta>
      <CbteTipo>${cbteTipo}</CbteTipo>`;
  const resultXml = await executeSoap('FECompUltimoAutorizado', content);
  const cbteNroMatch = resultXml.match(/<CbteNro>(\d+)<\/CbteNro>/);
  if (!cbteNroMatch) {
    const { errores } = parseErrObsBlocks(resultXml);
    if (errores[0]) throw new Error(`AFIP (${errores[0].code}): ${errores[0].msg}`);
    throw new Error('AFIP: No se obtuvo CbteNro en FECompUltimoAutorizado');
  }
  return parseInt(cbteNroMatch[1], 10);
}

export interface ConsultVoucherResult {
  resultado: string;
  cae: string;
  caeFchVto: string;
  observaciones: Array<{ code: number; msg: string }>;
  errores: Array<{ code: number; msg: string }>;
}

/** FECompConsultar — idempotencia post-timeout. */
export async function consultVoucher(
  ptoVta: number,
  cbteTipo: number,
  cbteNro: number
): Promise<ConsultVoucherResult | null> {
  const content = `
      <FeCompConsReq>
        <CbteTipo>${cbteTipo}</CbteTipo>
        <CbteNro>${cbteNro}</CbteNro>
        <PtoVta>${ptoVta}</PtoVta>
      </FeCompConsReq>`;

  try {
    const resultXml = await executeSoap('FECompConsultar', content);
    const resultado = resultXml.match(/<Resultado>([^<]*)<\/Resultado>/)?.[1]?.trim() ?? '';
    const cae = resultXml.match(/<CodAutorizacion>([^<]+)<\/CodAutorizacion>/)?.[1]?.trim()
      ?? resultXml.match(/<CAE>([^<]+)<\/CAE>/)?.[1]?.trim()
      ?? '';
    const caeVtoRaw = resultXml.match(/<FchVto>([^<]+)<\/FchVto>/)?.[1]?.trim()
      ?? resultXml.match(/<CAEFchVto>([^<]+)<\/CAEFchVto>/)?.[1]?.trim()
      ?? '';
    const { errores, observaciones } = parseErrObsBlocks(resultXml);

    if (!resultado && !cae && errores.length === 0) return null;

    return {
      resultado,
      cae,
      caeFchVto: formatAfipDateIso(caeVtoRaw),
      observaciones,
      errores,
    };
  } catch {
    return null;
  }
}

export interface AlicIva {
  Id: number;
  BaseImp: number;
  Importe: number;
}

export interface CreateVoucherParams {
  PtoVta: number;
  CbteTipo: number;
  Concepto: number;
  DocTipo: number;
  DocNro: number;
  CondIVAReceptor: number;
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
  CanMisMonExt?: 'S' | 'N';
  FchServDesde?: number;
  FchServHasta?: number;
  FchVtoPago?: number;
  Iva?: AlicIva[];
}

export interface VoucherEmitResult {
  resultado: string;
  cae: string;
  caeFchVto: string;
  observaciones: Array<{ code: number; msg: string }>;
  errores: Array<{ code: number; msg: string }>;
  requestSanitized?: string;
  responseSanitized?: string;
}

export function buildFecaDetRequestXml(params: CreateVoucherParams): string {
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

  const canMisMonExtBlock = params.CanMisMonExt
    ? `\n          <CanMisMonExt>${params.CanMisMonExt}</CanMisMonExt>`
    : '';

  return `
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
          <MonCotiz>${params.MonCotiz}</MonCotiz>${canMisMonExtBlock}
          <CondicionIVAReceptorId>${params.CondIVAReceptor}</CondicionIVAReceptorId>
          <FchServDesde>${fchServDesde}</FchServDesde>
          <FchServHasta>${fchServHasta}</FchServHasta>
          <FchVtoPago>${fchVtoPago}</FchVtoPago>${ivaBlock}
        </FECAEDetRequest>`;
}

/** Parsea respuesta FECAESolicitar — usable en tests sin llamar a ARCA. */
export function parseFecaSolicitarResponse(
  resultXml: string,
  requestSanitized?: string
): VoucherEmitResult {
  const responseSanitized = sanitizeFiscalXml(resultXml);
  const { errores, observaciones } = parseErrObsBlocks(resultXml);

  const cabResultado = resultXml.match(/<FeCabResp>[\s\S]*?<Resultado>([^<]*)<\/Resultado>/)?.[1]?.trim();
  const detResultado = resultXml.match(/<FECAEDetResponse>[\s\S]*?<Resultado>([^<]*)<\/Resultado>/)?.[1]?.trim()
    ?? resultXml.match(/<Resultado>([^<]*)<\/Resultado>/)?.[1]?.trim()
    ?? '';
  const resultado = detResultado || cabResultado || '';

  const cae = resultXml.match(/<CAE>([^<]+)<\/CAE>/)?.[1]?.trim() ?? '';
  const caeVto = resultXml.match(/<CAEFchVto>([^<]+)<\/CAEFchVto>/)?.[1]?.trim() ?? '';

  if (errores.length > 0 && !cae) {
    throw new Error(`AFIP (${errores[0]!.code}): ${errores[0]!.msg}`);
  }

  if (!cae && resultado.toUpperCase() !== 'A') {
    const obsMsg = observaciones.map((o) => `${o.code}: ${o.msg}`).join('; ');
    throw new Error(
      obsMsg
        ? `AFIP rechazó (${resultado}): ${obsMsg}`
        : `AFIP: No se obtuvo CAE (Resultado=${resultado || '?'})`
    );
  }

  return {
    resultado: resultado || (cae ? 'A' : 'R'),
    cae,
    caeFchVto: formatAfipDateIso(caeVto),
    observaciones,
    errores,
    requestSanitized,
    responseSanitized,
  };
}

export async function createVoucher(params: CreateVoucherParams): Promise<VoucherEmitResult> {
  const cantReg = params.CbteHasta - params.CbteDesde + 1;
  const det = buildFecaDetRequestXml(params);

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

  const requestSanitized = sanitizeFiscalXml(content);
  const resultXml = await executeSoap('FECAESolicitar', content);
  return parseFecaSolicitarResponse(resultXml, requestSanitized);
}

/** @deprecated Preferir emitVoucherFiscal — mantiene compatibilidad scripts. */
export async function createNextVoucher(
  params: Omit<CreateVoucherParams, 'CbteDesde' | 'CbteHasta'>
): Promise<{ voucherNumber: number; CAE: string; CAEFchVto: string }> {
  const lastVoucher = await getLastVoucher(params.PtoVta, params.CbteTipo);
  const voucherNumber = lastVoucher + 1;
  const result = await createVoucher({ ...params, CbteDesde: voucherNumber, CbteHasta: voucherNumber });
  return { voucherNumber, CAE: result.cae, CAEFchVto: result.caeFchVto };
}
