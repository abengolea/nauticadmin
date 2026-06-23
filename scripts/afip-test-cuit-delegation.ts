import '../src/lib/afip/tls-patch';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve('.env.afip.prod'), override: true });

import { runWithAfipSession } from '../src/lib/afip/session';
import { getLastVoucher } from '../src/lib/afip/wsfe';

async function test(cuit: string) {
  const session = {
    cuit,
    certPath: 'C:/secure/afip/prod/certificado_notificas_prod_2026.crt',
    keyPath: 'C:/secure/afip/prod/privada_notificas_prod_2026.key',
    chainPath: 'C:/secure/afip/prod/chain_prod.pem',
    production: true,
    cacheKey: 'certificado_notificas_prod_2026',
  };
  try {
    const n = await runWithAfipSession(session, () => getLastVoucher(6, 6));
    console.log('CUIT', cuit, '-> ultimo comprobante pto 6:', n);
  } catch (e) {
    console.log('CUIT', cuit, '-> ERROR:', e instanceof Error ? e.message : e);
  }
}

(async () => {
  await test('30693887743');
  await test('30714605522');
})();
