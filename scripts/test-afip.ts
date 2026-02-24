/**
 * Script para probar la conexión AFIP.
 *
 * Uso:
 *   npx tsx scripts/test-afip.ts        → usa .env.local (último bloque)
 *   npx tsx scripts/test-afip.ts homo  → fuerza homologación (.env.afip.homo)
 *   npx tsx scripts/test-afip.ts prod  → fuerza producción (.env.afip.prod)
 */
import '../src/lib/afip/tls-patch'; // debe ser el primer import (parche DH para AFIP prod)

import * as dotenv from 'dotenv';
import * as path from 'path';

const cwd = process.cwd();

// 1) Cargar .env y .env.local
dotenv.config();
dotenv.config({ path: path.resolve(cwd, '.env.local'), override: true });

// 2) Si se pasa homo o prod como argumento, cargar .env.afip.homo o .env.afip.prod
const arg = process.argv[2]?.toLowerCase();
if (arg === 'homo' || arg === 'prod') {
  const envFile = path.resolve(cwd, `.env.afip.${arg}`);
  const result = dotenv.config({ path: envFile, override: true });
  if (result.error) {
    console.warn(`[test-afip] No se encontró ${envFile}. Creá el archivo copiando .env.afip.${arg}.example`);
  }
}
import { getAfipConfig } from '../src/lib/duplicate-payments/afip-config';
import { emitAfipComprobante } from '../src/lib/duplicate-payments/afip-client';

async function main() {
  console.log('Verificando configuración AFIP...\n');

  // Debug: qué variables están cargadas (sin mostrar valores sensibles)
  const hasCuit = !!process.env.AFIP_CUIT;
  const hasCertPath = !!process.env.AFIP_CERT_PATH;
  const hasKeyPath = !!process.env.AFIP_KEY_PATH;
  const hasChainPath = !!process.env.AFIP_CHAIN_PATH;
  const rawProduction = process.env.AFIP_PRODUCTION ?? '(no definido)';
  const productionEnv = String(rawProduction).trim().toLowerCase() === 'true';
  console.log('Variables:', {
    AFIP_CUIT: hasCuit ? '✓' : '✗',
    AFIP_PRODUCTION: productionEnv ? 'true (prod)' : `false (homo) [valor: "${rawProduction}"]`,
    AFIP_CERT_PATH: hasCertPath ? '✓' : '✗',
    AFIP_KEY_PATH: hasKeyPath ? '✓' : '✗',
    AFIP_CHAIN_PATH: hasChainPath ? '✓' : '✗',
  });

  // Verificar que los archivos existan
  if (hasCertPath && hasKeyPath && hasChainPath) {
    const fs = await import('fs');
    const pathMod = await import('path');
    const certPath = pathMod.resolve(process.cwd(), process.env.AFIP_CERT_PATH!);
    const keyPath = pathMod.resolve(process.cwd(), process.env.AFIP_KEY_PATH!);
    const chainPath = pathMod.resolve(process.cwd(), process.env.AFIP_CHAIN_PATH!);
    console.log('Archivos:', {
      cert: fs.existsSync(certPath) ? '✓' : '✗',
      key: fs.existsSync(keyPath) ? '✓' : '✗',
      chain: fs.existsSync(chainPath) ? '✓' : '✗',
    });
  }

  const config = getAfipConfig();
  if (!config) {
    console.error('\n❌ No hay config AFIP. Revisá .env.local (AFIP_CUIT, AFIP_CERT_PATH, AFIP_KEY_PATH, AFIP_CHAIN_PATH)');
    process.exit(1);
  }

  console.log('Config OK:', {
    cuit: config.cuit,
    production: config.production,
    ptoVta: config.ptoVta,
    cbteTipo: config.cbteTipo,
  });
  console.log('');

  const envProduction = String(process.env.AFIP_PRODUCTION ?? '').trim().toLowerCase() === 'true';
  console.log('Intentando emitir comprobante de prueba (' + (envProduction ? 'producción' : 'homologación') + ')...');
  try {
    const result = await emitAfipComprobante({
      concept: 'Prueba de integración',
      amount: 100,
      currency: 'ARS',
      customerId: 'test',
      customerDocTipo: 99,
      customerDocNro: '0',
    });

    console.log('✅ Éxito!');
    console.log('  CAE:', result.cae);
    console.log('  Nro comprobante:', result.cbteNro);
    console.log('  Vencimiento CAE:', result.caeVto);
  } catch (err) {
    console.error('❌ Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
