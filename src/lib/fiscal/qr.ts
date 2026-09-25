/**
 * QR fiscal AFIP — construido exclusivamente desde AuthorizedInvoiceData.
 * @see https://www.afip.gob.ar/fe/qr/
 */

import type { AuthorizedInvoiceData } from './authorized-invoice';

export function buildAfipQrUrl(data: AuthorizedInvoiceData): string {
  const cuitEmisor = data.emisorCuit.replace(/\D/g, '');

  const qrData = {
    ver: 1,
    fecha: data.fecha,
    cuit: parseInt(cuitEmisor, 10),
    ptoVta: data.puntoVenta,
    tipoCmp: data.cbteTipo,
    nroCmp: data.numero,
    importe: data.amounts.impTotal,
    moneda: data.monedaAfip,
    ctz: data.cotizacionAfip,
    tipoDocRec: data.docTipoReceptor,
    nroDocRec: data.docNroReceptor,
    tipoCodAut: 'E',
    codAut: /^\d+$/.test(data.cae) ? data.cae : '0',
  };

  const base64 = Buffer.from(JSON.stringify(qrData), 'utf-8').toString('base64');
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}
