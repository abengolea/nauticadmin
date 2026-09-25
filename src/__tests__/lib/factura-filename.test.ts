import { describe, it, expect } from 'vitest';
import { buildFacturaPdfFilename, formatFacturaLabel } from '../../lib/factura-filename';

describe('buildFacturaPdfFilename', () => {
  it('arma el nombre AFIP de Factura B', () => {
    expect(
      buildFacturaPdfFilename({
        facturaTipo: 'FACTURA B',
        facturaPtoVta: 6,
        facturaNumero: 18716,
      })
    ).toBe('factura-B-0006-00018716.pdf');
  });

  it('arma el nombre AFIP de Factura A', () => {
    expect(
      buildFacturaPdfFilename({
        facturaTipo: 'FACTURA A',
        facturaPtoVta: 6,
        facturaNumero: 5327,
      })
    ).toBe('factura-A-0006-00005327.pdf');
  });

  it('retorna null si falta el número', () => {
    expect(buildFacturaPdfFilename({ facturaPtoVta: 6 })).toBeNull();
  });
});

describe('formatFacturaLabel', () => {
  it('muestra tipo y número', () => {
    expect(
      formatFacturaLabel({
        facturaTipo: 'FACTURA B',
        facturaPtoVta: 6,
        facturaNumero: 18716,
      })
    ).toBe('FACTURA B 0006-00018716');
  });
});
