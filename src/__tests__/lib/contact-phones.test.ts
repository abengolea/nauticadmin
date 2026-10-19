import { describe, expect, it } from 'vitest';
import {
  buildTutorContact,
  buildVendorPhonesPayload,
  formatPhonesDisplay,
  getContactPhones,
  normalizePhones,
  phonesForForm,
} from '@/lib/contact-phones';

describe('contact-phones', () => {
  it('normalizePhones deduplica por dígitos y omite vacíos', () => {
    expect(normalizePhones([' 011 1234-5678 ', '', '011-1234-5678', '15 9999-0000'])).toEqual([
      '011 1234-5678',
      '15 9999-0000',
    ]);
  });

  it('getContactPhones usa phones y cae a phone legacy', () => {
    expect(getContactPhones({ phone: '111', phones: ['222', '111'] })).toEqual(['222', '111']);
    expect(getContactPhones({ phone: '111' })).toEqual(['111']);
    expect(getContactPhones({})).toEqual([]);
  });

  it('phonesForForm siempre deja al menos un campo', () => {
    expect(phonesForForm(null)).toEqual(['']);
    expect(phonesForForm({ phone: '123' })).toEqual(['123']);
  });

  it('buildTutorContact guarda phone primario y phones', () => {
    expect(buildTutorContact('Ana', [' 111 ', '', '222'])).toEqual({
      name: 'Ana',
      phone: '111',
      phones: ['111', '222'],
    });
  });

  it('buildVendorPhonesPayload limpia con null/array vacío', () => {
    expect(buildVendorPhonesPayload(['', '  '])).toEqual({ phone: null, phones: [] });
    expect(buildVendorPhonesPayload(['111', '222'])).toEqual({
      phone: '111',
      phones: ['111', '222'],
    });
  });

  it('formatPhonesDisplay une con coma', () => {
    expect(formatPhonesDisplay({ phone: '1', phones: ['1', '2'] })).toBe('1, 2');
  });
});
