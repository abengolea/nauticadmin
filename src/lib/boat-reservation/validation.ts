import {
  BOAT_RESERVATION_WINDOW_MINUTES,
  BOAT_RESERVATION_GRACE_MINUTES,
  BOAT_RESERVATION_MAX_FUTURE_MINUTES,
} from './constants';

export type ReservationValidation = { ok: true } | { ok: false; reason: string };

export function validateBoatReservationTiming(
  arrivalAt: Date,
  now: Date = new Date()
): ReservationValidation {
  const windowMs = BOAT_RESERVATION_WINDOW_MINUTES * 60 * 1000;
  const graceMs = BOAT_RESERVATION_GRACE_MINUTES * 60 * 1000;
  const maxFutureMs = BOAT_RESERVATION_MAX_FUTURE_MINUTES * 60 * 1000;

  const arrivalMs = arrivalAt.getTime();
  const nowMs = now.getTime();

  if (arrivalMs > nowMs + maxFutureMs) {
    return {
      ok: false,
      reason: `La llegada no puede ser más de ${BOAT_RESERVATION_MAX_FUTURE_MINUTES} minutos en el futuro.`,
    };
  }

  const earliestMs = arrivalMs - windowMs;
  const latestMs = arrivalMs + graceMs;

  if (nowMs < earliestMs) {
    const minsLeft = Math.ceil((earliestMs - nowMs) / 60000);
    return {
      ok: false,
      reason: `Podés pedir tu lancha solo ${BOAT_RESERVATION_WINDOW_MINUTES} minutos antes de llegar. Faltan ${minsLeft} minuto(s).`,
    };
  }

  if (nowMs > latestMs) {
    return {
      ok: false,
      reason: 'El horario de llegada ya pasó. Indicá un nuevo horario.',
    };
  }

  return { ok: true };
}

export function getArrivalForQuickReserve(now: Date = new Date()): Date {
  return new Date(now.getTime() + BOAT_RESERVATION_WINDOW_MINUTES * 60 * 1000);
}
