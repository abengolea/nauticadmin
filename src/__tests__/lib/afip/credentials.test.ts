import { describe, it, expect } from 'vitest';
import { normalizePem } from '../../../lib/afip/credentials';

describe('normalizePem', () => {
  it('convierte \\n escapados de Secret Manager en saltos reales', () => {
    const pem = normalizePem('-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----');
    expect(pem).toContain('-----BEGIN CERTIFICATE-----\nABC\n');
    expect(pem.endsWith('\n')).toBe(true);
  });

  it('deja intacto un PEM con saltos reales', () => {
    const src = '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----';
    expect(normalizePem(src)).toBe(`${src}\n`);
  });
});
