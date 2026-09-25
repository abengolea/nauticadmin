/**
 * Tests fiscales WSFEv1 — Manual ARCA v4.8
 */

import { describe, it, expect } from 'vitest';
import {
  CBTE_TIPO,
  CONDICION_IVA_RECEPTOR,
  CONDICION_IVA_EMISOR,
  DOC_TIPO,
} from '../../../lib/fiscal/constants';
import { calculateFiscalAmounts, isFacturaC } from '../../../lib/fiscal/amounts';
import {
  determineVoucherType,
  parseEmisorCondicionFromConfig,
  reconcileConfiguredCbteTipo,
} from '../../../lib/fiscal/voucher-type';
import {
  parseCondicionIvaReceptorId,
  validateCondicionForVoucherClass,
  getCondicionIvaLabel,
} from '../../../lib/fiscal/iva-receptor';
import { resolveReceptorDocument, validateDocNroNotEmisor } from '../../../lib/fiscal/receptor-doc';
import {
  resolveCurrencyForRequest,
  cotizacionQueryDate,
  cotizacionCandidateDates,
  fetchArcaCotizacion,
  isCotizacionNotFoundError,
} from '../../../lib/fiscal/currency';
import { buildAfipQrUrl } from '../../../lib/fiscal/qr';
import { buildFecaDetRequestXml, parseFecaSolicitarResponse } from '../../../lib/afip/wsfe';
import { validateCuitChecksum } from '../../../lib/fiscal/cuit';
import type { AuthorizedInvoiceData } from '../../../lib/fiscal/authorized-invoice';
import { buildSimulationAuthorized } from '../../../lib/fiscal/simulation';
import { hasRealFiscalInvoice } from '../../../lib/fiscal/invoice-guard';
import { isApprovedResult, isAfipTimeoutError } from '../../../lib/fiscal/emit-voucher';
import { lockDocId } from '../../../lib/fiscal/voucher-lock';

const PARAM_TABLE = [
  { Id: 1, Desc: 'IVA Responsable Inscripto', Cmp_Clase: 'A/M/C' },
  { Id: 5, Desc: 'Consumidor Final', Cmp_Clase: 'B/C' },
  { Id: 6, Desc: 'Responsable Monotributo', Cmp_Clase: 'A/M/C' },
  { Id: 4, Desc: 'IVA Sujeto Exento', Cmp_Clase: 'B/C' },
  { Id: 15, Desc: 'IVA No Alcanzado', Cmp_Clase: 'B/C' },
];

function baseAuthorized(overrides: Partial<AuthorizedInvoiceData> = {}): AuthorizedInvoiceData {
  return {
    emisorRazonSocial: 'Test SA',
    emisorCuit: '30-69388774-3',
    emisorDomicilio: '-',
    emisorCondicionIVA: 'RI',
    cbteTipo: 6,
    tipoComprobanteLabel: 'FACTURA B',
    voucherClass: 'B',
    puntoVenta: 6,
    numero: 100,
    fecha: '2026-09-25',
    conceptoDescripcion: 'Cuota',
    receptorRazonSocial: 'Cliente',
    receptorDomicilio: '-',
    condicionIVAReceptorId: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
    condicionIVAReceptorLabel: 'Consumidor Final',
    docTipoReceptor: DOC_TIPO.DNI,
    docNroReceptor: 12345678,
    docDisplayReceptor: '12345678',
    amounts: calculateFiscalAmounts(1210, CBTE_TIPO.FACTURA_B),
    monedaAfip: 'PES',
    cotizacionAfip: 1,
    cancelaMismaMonedaExtranjera: false,
    cae: '72345678901234',
    caeFchVto: '2026-10-05',
    afipResultado: 'A',
    afipObservaciones: [],
    facturacionModo: 'real',
    simulacion: false,
    ...overrides,
  };
}

describe('determineVoucherType', () => {
  it('1. Factura A ARS — RI emisor a RI receptor', () => {
    const r = determineVoucherType({
      emisorCondicion: CONDICION_IVA_EMISOR.RESPONSABLE_INSCRIPTO,
      receptorCondicionId: CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO,
    });
    expect(r).toMatchObject({ cbteTipo: CBTE_TIPO.FACTURA_A, clase: 'A' });
  });

  it('2. Factura B ARS consumidor final', () => {
    const r = determineVoucherType({
      emisorCondicion: CONDICION_IVA_EMISOR.RESPONSABLE_INSCRIPTO,
      receptorCondicionId: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
    });
    expect(r).toMatchObject({ cbteTipo: CBTE_TIPO.FACTURA_B, clase: 'B' });
  });

  it('3. Factura C ARS sin IVA discriminado', () => {
    const r = determineVoucherType({
      emisorCondicion: CONDICION_IVA_EMISOR.MONOTRIBUTISTA,
      receptorCondicionId: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
    });
    expect(r).toMatchObject({ cbteTipo: CBTE_TIPO.FACTURA_C, clase: 'C' });
    const amounts = calculateFiscalAmounts(5000, CBTE_TIPO.FACTURA_C);
    expect(amounts.impIva).toBe(0);
    expect(amounts.iva).toBeUndefined();
  });
});

describe('calculateFiscalAmounts', () => {
  it('Factura B — IVA incluido 21%', () => {
    const a = calculateFiscalAmounts(121, CBTE_TIPO.FACTURA_B);
    expect(a.impTotal).toBe(121);
    expect(a.impNeto).toBe(100);
    expect(a.impIva).toBe(21);
  });

  it('Factura C — ImpIVA=0, sin bloque Iva', () => {
    const a = calculateFiscalAmounts(5000, CBTE_TIPO.FACTURA_C);
    expect(a.impIva).toBe(0);
    expect(a.iva).toBeUndefined();
    expect(a.impNeto).toBe(5000);
    expect(isFacturaC(11)).toBe(true);
  });
});

describe('condicion IVA receptor / RG 5616', () => {
  it('4. RI receptor con CUIT', () => {
    const doc = resolveReceptorDocument(
      { cuit: '30-69388774-3' },
      CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO
    );
    expect('docTipo' in doc && doc.docTipo).toBe(DOC_TIPO.CUIT);
  });

  it('5. Monotributista receptor', () => {
    const id = parseCondicionIvaReceptorId(undefined, 'Monotributista');
    expect(id).toBe(CONDICION_IVA_RECEPTOR.RESPONSABLE_MONOTRIBUTO);
  });

  it('6. Exento', () => {
    const id = parseCondicionIvaReceptorId(undefined, 'Exento');
    expect(id).toBe(CONDICION_IVA_RECEPTOR.IVA_SUJETO_EXENTO);
  });

  it('7. Consumidor final DNI', () => {
    const doc = resolveReceptorDocument(
      { dni: '12345678' },
      CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL
    );
    expect('docTipo' in doc && doc.docTipo).toBe(DOC_TIPO.DNI);
    expect('docNro' in doc && doc.docNro).toBe(12345678);
  });

  it('8. condición IVA inválida — no default silencioso', () => {
    expect(parseCondicionIvaReceptorId(undefined, 'Texto Inventado')).toBeNull();
  });

  it('9. condición incompatible con clase B para RI en factura B', () => {
    const v = validateCondicionForVoucherClass(1, 'B', PARAM_TABLE);
    expect(v.ok).toBe(false);
  });

  it('RI en clase A permitido', () => {
    const v = validateCondicionForVoucherClass(1, 'A', PARAM_TABLE);
    expect(v.ok).toBe(true);
  });
});

describe('receptor document validation', () => {
  it('RI con solo DNI bloqueado', () => {
    const r = resolveReceptorDocument({ dni: '12345678' }, CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO);
    expect('code' in r && r.code).toBe('inconsistent');
  });

  it('CUIT checksum inválido', () => {
    expect(validateCuitChecksum('30-69388774-0')).toBe(false);
  });

  it('CUIT receptor igual al emisor — AFIP 10069 bloqueado', () => {
    const r = resolveReceptorDocument(
      { cuit: '30-71460552-2' },
      CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO,
      { emisorCuit: '30714605522' }
    );
    expect('code' in r && r.code).toBe('inconsistent');
    expect(validateDocNroNotEmisor(30714605522, '30-71460552-2')?.message).toContain('10069');
  });
});

describe('moneda extranjera', () => {
  it('10. USD con CanMisMonExt requiere cotización ARCA', () => {
    const r = resolveCurrencyForRequest({
      paymentCurrency: 'USD',
      cancelaMismaMonedaExtranjera: true,
    });
    expect('error' in r).toBe(true);
  });

  it('11. USD cancelada en USD con cotización', () => {
    const r = resolveCurrencyForRequest({
      paymentCurrency: 'USD',
      cancelaMismaMonedaExtranjera: true,
      arcaCotizacion: 1200.5,
      cotizacionFecha: '20260924',
    });
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.monId).toBe('DOL');
      expect(r.canMisMonExt).toBe('S');
      expect(r.monCotiz).toBe(1200.5);
    }
  });

  it('cotizacionQueryDate formato yyyymmdd', () => {
    const d = new Date(2026, 8, 25);
    expect(cotizacionQueryDate(d)).toBe('20260925');
  });

  it('cotizacionCandidateDates incluye días previos', () => {
    const dates = cotizacionCandidateDates(new Date(2026, 8, 25), new Date(2026, 8, 25), 3);
    expect(dates).toEqual(['20260925', '20260924', '20260923', '20260922']);
  });

  it('fetchArcaCotizacion reintenta tras error 602', async () => {
    const calls: string[] = [];
    const cot = await fetchArcaCotizacion(
      async (_monId, fecha) => {
        calls.push(fecha ?? '');
        if (fecha === '20260925') {
          throw new Error('AFIP cotización (602): Sin Resultados: - Metodo FEParamGetCotizacion');
        }
        return 1180.5;
      },
      'DOL',
      new Date(2026, 8, 25),
      { today: new Date(2026, 8, 25), maxLookbackDays: 3 }
    );
    expect(cot.cotizacion).toBe(1180.5);
    expect(cot.cotizacionFecha).toBe('20260924');
    expect(calls[0]).toBe('20260925');
  });

  it('isCotizacionNotFoundError detecta 602', () => {
    expect(isCotizacionNotFoundError(new Error('AFIP cotización (602): Sin Resultados'))).toBe(true);
    expect(isCotizacionNotFoundError(new Error('timeout'))).toBe(false);
  });
});

describe('FECAESolicitar request XML', () => {
  it('Factura B request sanitizado', () => {
    const xml = buildFecaDetRequestXml({
      PtoVta: 6,
      CbteTipo: 6,
      Concepto: 2,
      DocTipo: 96,
      DocNro: 12345678,
      CondIVAReceptor: 5,
      CbteDesde: 100,
      CbteHasta: 100,
      CbteFch: 20260925,
      ImpTotal: 121,
      ImpTotConc: 0,
      ImpNeto: 100,
      ImpOpEx: 0,
      ImpIVA: 21,
      ImpTrib: 0,
      MonId: 'PES',
      MonCotiz: 1,
      Iva: [{ Id: 5, BaseImp: 100, Importe: 21 }],
    });
    expect(xml).toContain('<CondicionIVAReceptorId>5</CondicionIVAReceptorId>');
    expect(xml).toContain('<DocTipo>96</DocTipo>');
    expect(xml).toContain('<DocNro>12345678</DocNro>');
    expect(xml).not.toContain('CanMisMonExt');
  });

  it('Factura C sin bloque Iva', () => {
    const amounts = calculateFiscalAmounts(5000, CBTE_TIPO.FACTURA_C);
    const xml = buildFecaDetRequestXml({
      PtoVta: 6,
      CbteTipo: 11,
      Concepto: 2,
      DocTipo: 96,
      DocNro: 12345678,
      CondIVAReceptor: 5,
      CbteDesde: 50,
      CbteHasta: 50,
      CbteFch: 20260925,
      ImpTotal: amounts.impTotal,
      ImpTotConc: amounts.impTotConc,
      ImpNeto: amounts.impNeto,
      ImpOpEx: amounts.impOpEx,
      ImpIVA: amounts.impIva,
      ImpTrib: amounts.impTrib,
      MonId: 'PES',
      MonCotiz: 1,
    });
    expect(xml).toContain('<ImpIVA>0</ImpIVA>');
    expect(xml).not.toContain('<Iva>');
  });

  it('Factura A request', () => {
    const xml = buildFecaDetRequestXml({
      PtoVta: 6,
      CbteTipo: 1,
      Concepto: 2,
      DocTipo: 80,
      DocNro: 30693887743,
      CondIVAReceptor: 1,
      CbteDesde: 10,
      CbteHasta: 10,
      CbteFch: 20260925,
      ImpTotal: 121,
      ImpTotConc: 0,
      ImpNeto: 100,
      ImpOpEx: 0,
      ImpIVA: 21,
      ImpTrib: 0,
      MonId: 'PES',
      MonCotiz: 1,
      Iva: [{ Id: 5, BaseImp: 100, Importe: 21 }],
    });
    expect(xml).toContain('<DocTipo>80</DocTipo>');
    expect(xml).toContain('<CondicionIVAReceptorId>1</CondicionIVAReceptorId>');
    expect(xml).toContain('<ImpIVA>21</ImpIVA>');
  });

  it('Factura USD con CanMisMonExt', () => {
    const xml = buildFecaDetRequestXml({
      PtoVta: 6,
      CbteTipo: 6,
      Concepto: 2,
      DocTipo: 96,
      DocNro: 12345678,
      CondIVAReceptor: 5,
      CbteDesde: 100,
      CbteHasta: 100,
      CbteFch: 20260925,
      ImpTotal: 100,
      ImpTotConc: 0,
      ImpNeto: 82.64,
      ImpOpEx: 0,
      ImpIVA: 17.36,
      ImpTrib: 0,
      MonId: 'DOL',
      MonCotiz: 1200,
      CanMisMonExt: 'S',
      Iva: [{ Id: 5, BaseImp: 82.64, Importe: 17.36 }],
    });
    expect(xml).toContain('<MonId>DOL</MonId>');
    expect(xml).toContain('<CanMisMonExt>S</CanMisMonExt>');
    expect(xml).toContain('<MonCotiz>1200</MonCotiz>');
  });
});

describe('parseFecaSolicitarResponse', () => {
  it('12. rechazo ARCA sin CAE', () => {
    const xml = `
      <FECAESolicitarResult>
        <FeDetResp>
          <FECAEDetResponse>
            <Resultado>R</Resultado>
            <Observaciones>
              <Obs><Code>10016</Code><Msg>Datos inválidos</Msg></Obs>
            </Observaciones>
          </FECAEDetResponse>
        </FeDetResp>
      </FECAESolicitarResult>`;
    expect(() => parseFecaSolicitarResponse(xml)).toThrow(/rechazó|No se obtuvo CAE/);
  });

  it('13. autorización con observación no bloqueante', () => {
    const xml = `
      <FECAESolicitarResult>
        <FeDetResp>
          <FECAEDetResponse>
            <Resultado>A</Resultado>
            <CAE>72345678901234</CAE>
            <CAEFchVto>20261005</CAEFchVto>
            <Observaciones>
              <Obs><Code>10245</Code><Msg>Observación informativa</Msg></Obs>
            </Observaciones>
          </FECAEDetResponse>
        </FeDetResp>
      </FECAESolicitarResult>`;
    const r = parseFecaSolicitarResponse(xml);
    expect(r.resultado).toBe('A');
    expect(r.cae).toBe('72345678901234');
    expect(r.observaciones).toHaveLength(1);
    expect(isApprovedResult(r.resultado)).toBe(true);
  });
});

describe('idempotencia y concurrencia', () => {
  it('14. detecta error timeout ARCA', () => {
    expect(isAfipTimeoutError('timeout of 30000ms exceeded')).toBe(true);
    expect(isAfipTimeoutError('ECONNRESET')).toBe(true);
    expect(isAfipTimeoutError('AFIP rechazó')).toBe(false);
  });

  it('15. reintento usa pendingVoucherNumber vía hasRealFiscalInvoice', () => {
    expect(
      hasRealFiscalInvoice({
        facturacionModo: 'real',
        facturado: true,
        CAE: '72345678901234',
      })
    ).toBe(true);
    expect(
      hasRealFiscalInvoice({
        fiscalPendingVoucherNumber: 101,
        facturado: false,
      })
    ).toBe(false);
  });

  it('16. doble facturación bloqueada si ya hay CAE real', () => {
    expect(
      hasRealFiscalInvoice({ facturacionModo: 'real', facturado: true, CAE: '72345678901234' })
    ).toBe(true);
    expect(hasRealFiscalInvoice({ facturacionModo: 'simulacion', facturado: false })).toBe(false);
  });

  it('17. lock doc id único por CUIT+PtoVta+CbteTipo', () => {
    expect(lockDocId('30-69388774-3', 6, 6)).toBe('30693887743_6_6');
    expect(lockDocId('30-69388774-3', 6, 1)).not.toBe(lockDocId('30-69388774-3', 6, 6));
  });
});

describe('QR fiscal', () => {
  it('18. QR igual a datos autorizados (DNI, no pseudo-CUIT)', () => {
    const data = baseAuthorized({
      docTipoReceptor: DOC_TIPO.DNI,
      docNroReceptor: 12345678,
      docDisplayReceptor: '12345678',
    });
    const url = buildAfipQrUrl(data);
    const payload = JSON.parse(Buffer.from(url.split('p=')[1]!, 'base64').toString('utf-8'));
    expect(payload.nroDocRec).toBe(12345678);
    expect(payload.tipoDocRec).toBe(96);
    expect(payload.moneda).toBe('PES');
    expect(payload.codAut).toBe('72345678901234');
  });

  it('QR USD con cotización', () => {
    const data = baseAuthorized({
      monedaAfip: 'DOL',
      cotizacionAfip: 1200,
      amounts: calculateFiscalAmounts(100, CBTE_TIPO.FACTURA_B),
    });
    const url = buildAfipQrUrl(data);
    const payload = JSON.parse(Buffer.from(url.split('p=')[1]!, 'base64').toString('utf-8'));
    expect(payload.moneda).toBe('DOL');
    expect(payload.ctz).toBe(1200);
  });
});

describe('simulación', () => {
  it('19. simulación no usa CAE real ni marca facturado', () => {
    const sim = buildSimulationAuthorized({
      emisor: { razonSocial: 'X', cuit: '30-69388774-3', domicilio: '-', condicionIVA: 'RI' },
      receptor: { razonSocial: 'Y', domicilio: '-' },
      receptorDoc: { docTipo: 96, docNro: 12345678, docDisplay: '12345678' },
      condicionIVAReceptorId: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
      cbteTipo: CBTE_TIPO.FACTURA_B,
      tipoComprobanteLabel: 'FACTURA B',
      ptoVta: 6,
      numero: 900001,
      fecha: '2026-09-25',
      conceptoDescripcion: 'Test',
      totalAmount: 121,
      currency: 'ARS',
    });
    expect(sim.facturacionModo).toBe('simulacion');
    expect(sim.cae).toBe('SIM-NO-VALIDO');
    expect(sim.simulacion).toBe(true);
    expect(hasRealFiscalInvoice({ facturacionModo: 'simulacion', facturado: false })).toBe(false);
  });
});

describe('reconcileConfiguredCbteTipo', () => {
  it('config B + receptor RI emite Factura A sin bloquear', () => {
    const r = reconcileConfiguredCbteTipo(CBTE_TIPO.FACTURA_A, CBTE_TIPO.FACTURA_B);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cbteTipo).toBe(CBTE_TIPO.FACTURA_A);
      expect(r.warning).toBeDefined();
    }
  });

  it('config coincide — sin warning', () => {
    const r = reconcileConfiguredCbteTipo(CBTE_TIPO.FACTURA_B, CBTE_TIPO.FACTURA_B);
    expect(r.ok).toBe(true);
    expect(r.cbteTipo).toBe(CBTE_TIPO.FACTURA_B);
    expect(r.warning).toBeUndefined();
  });
});

describe('parseEmisorCondicionFromConfig', () => {
  it('detecta monotributista emisor', () => {
    expect(parseEmisorCondicionFromConfig('Monotributista')).toBe(CONDICION_IVA_EMISOR.MONOTRIBUTISTA);
  });
});

describe('getCondicionIvaLabel', () => {
  it('retorna etiqueta ARCA', () => {
    expect(getCondicionIvaLabel(CONDICION_IVA_RECEPTOR.IVA_NO_ALCANZADO)).toContain('No Alcanzado');
  });
});
