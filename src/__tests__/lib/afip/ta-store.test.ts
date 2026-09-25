import { describe, it, expect } from 'vitest';
import { isTaValid, sharedTaDocId } from '../../../lib/afip/ta-store';

describe('sharedTaDocId', () => {
  it('usa notificas_prod por defecto', () => {
    expect(sharedTaDocId(true)).toBe('notificas_prod');
    expect(sharedTaDocId(false)).toBe('notificas_homo');
  });
});

describe('isTaValid', () => {
  it('acepta un TA vigente', () => {
    const expirationTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(
      isTaValid({ token: 't', sign: 's', expirationTime }, 10 * 60 * 1000)
    ).toBe(true);
  });

  it('rechaza un TA por vencer dentro del margen', () => {
    const expirationTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    expect(
      isTaValid({ token: 't', sign: 's', expirationTime }, 10 * 60 * 1000)
    ).toBe(false);
  });
});
