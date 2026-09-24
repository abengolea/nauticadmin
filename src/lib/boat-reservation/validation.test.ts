import { describe, it, expect } from 'vitest';
import { validateBoatReservationTiming, getArrivalForQuickReserve } from './validation';
import { BOAT_RESERVATION_WINDOW_MINUTES } from './constants';

describe('validateBoatReservationTiming', () => {
  it('allows quick reserve (arrival in 10 min from now)', () => {
    const now = new Date('2026-03-24T14:00:00');
    const arrival = getArrivalForQuickReserve(now);
    expect(validateBoatReservationTiming(arrival, now).ok).toBe(true);
  });

  it('blocks request too early before scheduled arrival', () => {
    const now = new Date('2026-03-24T14:00:00');
    const arrival = new Date('2026-03-24T14:25:00');
    const result = validateBoatReservationTiming(arrival, now);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(String(BOAT_RESERVATION_WINDOW_MINUTES));
    }
  });

  it('allows request within 10 min window before arrival', () => {
    const arrival = new Date('2026-03-24T15:00:00');
    const now = new Date('2026-03-24T14:52:00');
    expect(validateBoatReservationTiming(arrival, now).ok).toBe(true);
  });
});
