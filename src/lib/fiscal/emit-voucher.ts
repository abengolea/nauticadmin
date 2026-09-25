/**
 * Emisión fiscal con idempotencia, lock y validación RG 5616.
 */

import {
  createVoucher,
  getLastVoucher,
  consultVoucher,
  getCotizacion,
  type CreateVoucherParams,
  type VoucherEmitResult,
} from '@/lib/afip/wsfe';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { withVoucherLock } from './voucher-lock';
import { getCondicionIvaReceptorTable } from './condicion-iva-cache';
import {
  validateCondicionForVoucherClass,
  voucherClassFromCbteTipo,
  getCondicionIvaLabel,
} from './iva-receptor';
import type { CondicionIvaReceptorId } from './constants';
import { validateDocNroNotEmisor } from './receptor-doc';
import { fetchArcaCotizacion, resolveCurrencyForRequest } from './currency';
import { calculateFiscalAmounts } from './amounts';
import { sanitizeFiscalXml, truncateForStorage } from './sanitize';
import type { AuthorizedInvoiceData, FiscalAuditPayload } from './authorized-invoice';

export interface EmitVoucherInput {
  db: Firestore;
  lockOwnerId: string;
  cuitEmisor: string;
  ptoVta: number;
  cbteTipo: number;
  concepto: number;
  cbteFch: number;
  fechaIso: string;
  docTipo: number;
  docNro: number;
  docDisplay: string;
  condicionIVAReceptorId: CondicionIvaReceptorId;
  paymentCurrency: string;
  cancelaMismaMonedaExtranjera: boolean;
  totalAmount: number;
  /** Si existe, intentar FECompConsultar antes de emitir (reintento/idempotencia) */
  pendingVoucherNumber?: number;
  /** Persiste fiscalPendingVoucherNumber antes de FECAESolicitar */
  paymentRef?: DocumentReference;
  fchServDesde?: number;
  fchServHasta?: number;
  fchVtoPago?: number;
}

export interface EmitVoucherOutput {
  voucherNumber: number;
  result: VoucherEmitResult;
  authorized: Pick<
    AuthorizedInvoiceData,
    'cae' | 'caeFchVto' | 'afipResultado' | 'afipObservaciones' | 'amounts' | 'monedaAfip' | 'cotizacionAfip' | 'cotizacionFecha' | 'cancelaMismaMonedaExtranjera'
  >;
  audit: FiscalAuditPayload;
}

export function isApprovedResult(resultado: string): boolean {
  return resultado.toUpperCase() === 'A';
}

export function isAfipTimeoutError(message: string): boolean {
  return /timeout|ETIMEDOUT|ECONNRESET/i.test(message);
}

function buildWsfeParams(
  input: EmitVoucherInput,
  voucherNumber: number,
  currency: ReturnType<typeof resolveCurrencyForRequest> & { monId: string }
): CreateVoucherParams {
  const amounts = calculateFiscalAmounts(input.totalAmount, input.cbteTipo as 1 | 6 | 11);
  const curr = 'error' in currency ? null : currency;

  return {
    PtoVta: input.ptoVta,
    CbteTipo: input.cbteTipo,
    Concepto: input.concepto,
    DocTipo: input.docTipo,
    DocNro: input.docNro,
    CondIVAReceptor: input.condicionIVAReceptorId,
    CbteDesde: voucherNumber,
    CbteHasta: voucherNumber,
    CbteFch: input.cbteFch,
    ImpTotal: amounts.impTotal,
    ImpTotConc: amounts.impTotConc,
    ImpNeto: amounts.impNeto,
    ImpOpEx: amounts.impOpEx,
    ImpIVA: amounts.impIva,
    ImpTrib: amounts.impTrib,
    MonId: curr?.monId ?? 'PES',
    MonCotiz: curr?.monCotiz ?? 1,
    CanMisMonExt: curr?.canMisMonExt,
    FchServDesde: input.fchServDesde ?? input.cbteFch,
    FchServHasta: input.fchServHasta ?? input.cbteFch,
    FchVtoPago: input.fchVtoPago ?? input.cbteFch,
    Iva: amounts.iva,
  };
}

export async function emitVoucherFiscal(input: EmitVoucherInput): Promise<EmitVoucherOutput> {
  const voucherClass = voucherClassFromCbteTipo(input.cbteTipo);
  const paramTable = await getCondicionIvaReceptorTable();
  const condValidation = validateCondicionForVoucherClass(
    input.condicionIVAReceptorId,
    voucherClass,
    paramTable
  );
  if (!condValidation.ok) {
    throw new Error(condValidation.error);
  }

  const emisorDocCheck = validateDocNroNotEmisor(input.docNro, input.cuitEmisor);
  if (emisorDocCheck) {
    throw new Error(emisorDocCheck.message);
  }

  const emissionDate = new Date(
    Math.floor(input.cbteFch / 10000),
    Math.floor((input.cbteFch % 10000) / 100) - 1,
    input.cbteFch % 100
  );

  let arcaCotiz: number | undefined;
  let cotizacionFecha: string | undefined;
  const monId = input.paymentCurrency.toUpperCase() === 'USD' ? 'DOL' : 'PES';
  if (monId !== 'PES') {
    const cot = await fetchArcaCotizacion(getCotizacion, monId, emissionDate);
    arcaCotiz = cot.cotizacion;
    cotizacionFecha = cot.cotizacionFecha;
  }

  const currencyResolved = resolveCurrencyForRequest({
    paymentCurrency: input.paymentCurrency,
    cancelaMismaMonedaExtranjera: input.cancelaMismaMonedaExtranjera,
    arcaCotizacion: arcaCotiz,
    cotizacionFecha,
  });
  if ('error' in currencyResolved) {
    throw new Error(currencyResolved.error);
  }

  return withVoucherLock(
    input.db,
    {
      cuit: input.cuitEmisor,
      ptoVta: input.ptoVta,
      cbteTipo: input.cbteTipo,
      ownerId: input.lockOwnerId,
    },
    async () => {
      let voucherNumber = input.pendingVoucherNumber;

      if (voucherNumber != null) {
        const existing = await consultVoucher(input.ptoVta, input.cbteTipo, voucherNumber);
        if (existing && isApprovedResult(existing.resultado) && existing.cae) {
          const amounts = calculateFiscalAmounts(input.totalAmount, input.cbteTipo as 1 | 6 | 11);
          return buildOutput(
            input,
            voucherNumber,
            consultToEmitResult(existing),
            amounts,
            currencyResolved
          );
        }
      }

      if (voucherNumber == null) {
        const last = await getLastVoucher(input.ptoVta, input.cbteTipo);
        voucherNumber = last + 1;
        const probe = await consultVoucher(input.ptoVta, input.cbteTipo, voucherNumber);
        if (probe && isApprovedResult(probe.resultado) && probe.cae) {
          return buildOutput(
            input,
            voucherNumber,
            consultToEmitResult(probe),
            calculateFiscalAmounts(input.totalAmount, input.cbteTipo as 1 | 6 | 11),
            currencyResolved
          );
        }
      }

      if (input.paymentRef) {
        await input.paymentRef.set(
          { fiscalPendingVoucherNumber: voucherNumber },
          { merge: true }
        );
      }

      const params = buildWsfeParams(input, voucherNumber!, currencyResolved);

      let result: VoucherEmitResult;
      try {
        result = await createVoucher(params);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = isAfipTimeoutError(msg);
        if (isTimeout) {
          const recovered = await consultVoucher(input.ptoVta, input.cbteTipo, voucherNumber!);
          if (recovered && isApprovedResult(recovered.resultado) && recovered.cae) {
            return buildOutput(
              input,
              voucherNumber!,
              consultToEmitResult(recovered),
              calculateFiscalAmounts(input.totalAmount, input.cbteTipo as 1 | 6 | 11),
              currencyResolved
            );
          }
        }
        throw err;
      }

      if (!isApprovedResult(result.resultado) || !result.cae) {
        const errMsgs = result.errores.map((e) => `${e.code}: ${e.msg}`).join('; ');
        throw new Error(errMsgs || `ARCA rechazó la emisión (Resultado=${result.resultado})`);
      }

      return buildOutput(
        input,
        voucherNumber!,
        result,
        calculateFiscalAmounts(input.totalAmount, input.cbteTipo as 1 | 6 | 11),
        currencyResolved
      );
    }
  );
}

function consultToEmitResult(
  c: import('@/lib/afip/wsfe').ConsultVoucherResult
): VoucherEmitResult {
  return {
    resultado: c.resultado,
    cae: c.cae,
    caeFchVto: c.caeFchVto,
    observaciones: c.observaciones,
    errores: c.errores,
  };
}

function buildOutput(
  input: EmitVoucherInput,
  voucherNumber: number,
  result: VoucherEmitResult,
  amounts: ReturnType<typeof calculateFiscalAmounts>,
  currency: { monId: string; monCotiz: number; cotizacionFecha?: string; cancelaMismaMonedaExtranjera: boolean }
): EmitVoucherOutput {
  return {
    voucherNumber,
    result,
    authorized: {
      cae: result.cae,
      caeFchVto: result.caeFchVto,
      afipResultado: result.resultado,
      afipObservaciones: result.observaciones,
      amounts,
      monedaAfip: currency.monId,
      cotizacionAfip: currency.monCotiz,
      cotizacionFecha: currency.cotizacionFecha,
      cancelaMismaMonedaExtranjera: currency.cancelaMismaMonedaExtranjera,
    },
    audit: {
      afipResultado: result.resultado,
      afipObservaciones: result.observaciones,
      afipErrores: result.errores,
      condicionIVAReceptorId: input.condicionIVAReceptorId,
      docTipoReceptor: input.docTipo,
      docNroReceptor: input.docNro,
      monedaAfip: currency.monId,
      cotizacionAfip: currency.monCotiz,
      cotizacionFecha: currency.cotizacionFecha,
      cancelaMismaMonedaExtranjera: currency.cancelaMismaMonedaExtranjera,
      facturacionModo: 'real',
      afipRequestSanitized: result.requestSanitized
        ? truncateForStorage(result.requestSanitized)
        : undefined,
      afipResponseSanitized: result.responseSanitized
        ? truncateForStorage(result.responseSanitized)
        : undefined,
    },
  };
}

export function buildAuthorizedInvoiceData(params: {
  input: EmitVoucherInput;
  output: EmitVoucherOutput;
  emisor: { razonSocial: string; cuit: string; domicilio: string; condicionIVA: string };
  receptor: { razonSocial: string; domicilio: string };
  tipoComprobanteLabel: string;
  conceptoDescripcion: string;
  facturacionModo: 'real' | 'simulacion';
}): AuthorizedInvoiceData {
  const { input, output, emisor, receptor, tipoComprobanteLabel, conceptoDescripcion, facturacionModo } =
    params;
  return {
    emisorRazonSocial: emisor.razonSocial,
    emisorCuit: emisor.cuit,
    emisorDomicilio: emisor.domicilio,
    emisorCondicionIVA: emisor.condicionIVA,
    cbteTipo: input.cbteTipo,
    tipoComprobanteLabel,
    voucherClass: voucherClassFromCbteTipo(input.cbteTipo),
    puntoVenta: input.ptoVta,
    numero: output.voucherNumber,
    fecha: input.fechaIso,
    conceptoDescripcion,
    receptorRazonSocial: receptor.razonSocial,
    receptorDomicilio: receptor.domicilio,
    condicionIVAReceptorId: input.condicionIVAReceptorId,
    condicionIVAReceptorLabel: getCondicionIvaLabel(input.condicionIVAReceptorId),
    docTipoReceptor: input.docTipo,
    docNroReceptor: input.docNro,
    docDisplayReceptor: input.docDisplay,
    amounts: output.authorized.amounts,
    monedaAfip: output.authorized.monedaAfip,
    cotizacionAfip: output.authorized.cotizacionAfip,
    cotizacionFecha: output.authorized.cotizacionFecha,
    cancelaMismaMonedaExtranjera: output.authorized.cancelaMismaMonedaExtranjera,
    cae: output.authorized.cae,
    caeFchVto: output.authorized.caeFchVto,
    afipResultado: output.authorized.afipResultado,
    afipObservaciones: output.authorized.afipObservaciones,
    facturacionModo,
    simulacion: facturacionModo === 'simulacion',
  };
}
