/**
 * Moneda extranjera — CanMisMonExt, MonCotiz, FEParamGetCotizacion (WSFE v4.8).
 */

import { MONEDA } from './constants';

export interface CurrencyResolution {
  monId: string;
  monCotiz: number;
  canMisMonExt?: 'S' | 'N';
  cotizacionFecha?: string;
  cancelaMismaMonedaExtranjera: boolean;
}

export function mapPaymentCurrencyToMonId(currency: string): string {
  const c = currency.toUpperCase();
  if (c === 'USD' || c === 'DOL' || c === 'U$S') return MONEDA.DOL;
  return MONEDA.PES;
}

/**
 * Resuelve moneda y cotización para el request WSFE.
 * @param arcaCotizacion cotización oficial ARCA (FEParamGetCotizacion) si MonId != PES
 */
export function resolveCurrencyForRequest(params: {
  paymentCurrency: string;
  cancelaMismaMonedaExtranjera: boolean;
  arcaCotizacion?: number;
  cotizacionFecha?: string;
}): CurrencyResolution | { error: string } {
  const monId = mapPaymentCurrencyToMonId(params.paymentCurrency);

  if (monId === MONEDA.PES) {
    return {
      monId,
      monCotiz: 1,
      cancelaMismaMonedaExtranjera: false,
    };
  }

  if (params.cancelaMismaMonedaExtranjera) {
    if (params.arcaCotizacion == null || params.arcaCotizacion <= 0) {
      return {
        error:
          'Para facturar en moneda extranjera cancelada en la misma moneda se requiere la cotización oficial ARCA (FEParamGetCotizacion)',
      };
    }
    return {
      monId,
      monCotiz: params.arcaCotizacion,
      canMisMonExt: 'S',
      cotizacionFecha: params.cotizacionFecha,
      cancelaMismaMonedaExtranjera: true,
    };
  }

  // Moneda extranjera sin CanMisMonExt=S: MonCotiz opcional según manual v4.8
  return {
    monId,
    monCotiz: params.arcaCotizacion && params.arcaCotizacion > 0 ? params.arcaCotizacion : 1,
    canMisMonExt: 'N',
    cotizacionFecha: params.cotizacionFecha,
    cancelaMismaMonedaExtranjera: false,
  };
}

/** Fecha yyyymmdd para consulta cotización según regla MonCotiz v4.8. */
export function cotizacionQueryDate(emissionDate: Date, today: Date = new Date()): string {
  const emission = new Date(emissionDate.getFullYear(), emissionDate.getMonth(), emissionDate.getDate());
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = emission.getTime() <= now.getTime() ? emission : now;
  return formatAfipDateYmd(target);
}

export function formatAfipDateYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function parseAfipDateYmd(yyyymmdd: string): Date {
  const y = parseInt(yyyymmdd.slice(0, 4), 10);
  const m = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
  const d = parseInt(yyyymmdd.slice(6, 8), 10);
  return new Date(y, m, d);
}

/** ARCA 602 / sin filas: típico fin de semana, feriado o cotización aún no publicada. */
export function isCotizacionNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\(602\)|Sin Resultados|No se obtuvo cotización/i.test(msg);
}

/**
 * Fechas a consultar: día de emisión (o hoy si es futuro) + días calendario previos.
 * ARCA publica cotización con lag; fines de semana no tienen fila.
 */
export function cotizacionCandidateDates(
  emissionDate: Date,
  today: Date = new Date(),
  maxLookbackDays = 10
): string[] {
  const primary = cotizacionQueryDate(emissionDate, today);
  const dates = [primary];
  const base = parseAfipDateYmd(primary);
  for (let i = 1; i <= maxLookbackDays; i++) {
    const prev = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    dates.push(formatAfipDateYmd(prev));
  }
  return dates;
}

export interface ArcaCotizacionResult {
  cotizacion: number;
  cotizacionFecha: string;
  attemptedDates: string[];
}

/**
 * FEParamGetCotizacion con fallback a días anteriores si no hay cotización (602).
 */
export async function fetchArcaCotizacion(
  fetchCotiz: (monId: string, monFecha?: string) => Promise<number>,
  monId: string,
  emissionDate: Date,
  options?: { maxLookbackDays?: number; today?: Date }
): Promise<ArcaCotizacionResult> {
  const attemptedDates: string[] = [];
  const candidates = cotizacionCandidateDates(
    emissionDate,
    options?.today,
    options?.maxLookbackDays ?? 10
  );
  let lastError: unknown;

  for (const fecha of candidates) {
    attemptedDates.push(fecha);
    try {
      const cotizacion = await fetchCotiz(monId, fecha);
      if (Number.isFinite(cotizacion) && cotizacion > 0) {
        return { cotizacion, cotizacionFecha: fecha, attemptedDates };
      }
    } catch (err) {
      lastError = err;
      if (!isCotizacionNotFoundError(err)) {
        throw err;
      }
    }
  }

  const range = `${attemptedDates[0]}…${attemptedDates[attemptedDates.length - 1]}`;
  const detail = lastError instanceof Error ? ` (${lastError.message})` : '';
  throw new Error(
    `No se obtuvo cotización ARCA para ${monId} en ${attemptedDates.length} fechas (${range})${detail}`
  );
}
