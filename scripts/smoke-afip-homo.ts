/**
 * Smoke test de homologación ARCA / WSFEv1 (Manual FE v4.8).
 *
 * Valida conectividad y parámetros fiscales SIN emitir por defecto.
 * Con --emit emite una Factura B mínima y verifica FECompConsultar.
 *
 * Uso:
 *   npx tsx scripts/smoke-afip-homo.ts                    → homo, solo lectura
 *   npx tsx scripts/smoke-afip-homo.ts homo               → idem
 *   npx tsx scripts/smoke-afip-homo.ts homo --emit         → incluye emisión B
 *   npx tsx scripts/smoke-afip-homo.ts homo --school-id=XXX  → CUIT emisor desde Firestore
 *
 * Nunca corre en producción salvo --allow-prod explícito.
 */
import '../src/lib/afip/tls-patch';

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as admin from 'firebase-admin';
import { runWithAfipSession, resolveAfipSessionFromEnv, type AfipSession } from '../src/lib/afip/session';
import { getAfipToken } from '../src/lib/afip/wsaa';
import {
  getCondicionIvaReceptor,
  getCotizacion,
  getLastVoucher,
  createVoucher,
  consultVoucher,
  buildFecaDetRequestXml,
} from '../src/lib/afip/wsfe';
import {
  CBTE_TIPO,
  CONDICION_IVA_RECEPTOR,
  WSFE_MANUAL_VERSION,
} from '../src/lib/fiscal/constants';
import { calculateFiscalAmounts } from '../src/lib/fiscal/amounts';
import { fetchArcaCotizacion } from '../src/lib/fiscal/currency';
import { validateCondicionForVoucherClass } from '../src/lib/fiscal/iva-receptor';
import {
  loadSchoolFacturacion,
  facturacionToAfipSession,
  getPtoVta,
  type SchoolFacturacion,
} from '../src/lib/school-facturacion';

const cwd = process.cwd();

dotenv.config();
dotenv.config({ path: path.resolve(cwd, '.env.local'), override: true });

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith('--'));
const flags = new Set(argv.filter((a) => a.startsWith('--')));

const envArg = (positional[0] ?? 'homo').toLowerCase();
const doEmit = flags.has('--emit');
const allowProd = flags.has('--allow-prod');
const schoolIdArg = argv.find((a) => a.startsWith('--school-id='))?.split('=')[1]?.trim();

if (envArg === 'homo' || envArg === 'prod') {
  const envFile = path.resolve(cwd, `.env.afip.${envArg}`);
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true });
  } else if (envArg === 'homo') {
    console.warn(`[smoke] No se encontró ${envFile} — usando .env.local`);
  }
}

if (envArg === 'homo') {
  process.env.AFIP_PRODUCTION = 'false';
}

interface StepResult {
  id: string;
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
  error?: string;
}

const results: StepResult[] = [];

async function step(id: string, name: string, fn: () => Promise<string | void>): Promise<void> {
  const t0 = Date.now();
  process.stdout.write(`  ▶ ${name}... `);
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    results.push({ id, name, ok: true, ms, detail: detail ?? undefined });
    console.log(`OK (${ms}ms)${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    const ms = Date.now() - t0;
    const error = err instanceof Error ? err.message : String(err);
    results.push({ id, name, ok: false, ms, error });
    console.log(`FALLÓ (${ms}ms)`);
    console.log(`    ${error}`);
  }
}

function resolveCredentialsPath(): string {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    const absolute = path.isAbsolute(envPath) ? envPath : path.join(cwd, envPath);
    if (fs.existsSync(absolute)) return absolute;
  }
  for (const p of [
    path.join(cwd, 'service-account.json'),
    'C:/SECRETS/nauticadmin-firebase-adminsdk-fbsvc-d511f4fa32.json',
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

async function resolveSession(): Promise<{ session: AfipSession; ptoVta: number; emisorLabel: string }> {
  if (schoolIdArg) {
    const credPath = resolveCredentialsPath();
    if (!credPath) {
      throw new Error(
        '--school-id requiere GOOGLE_APPLICATION_CREDENTIALS o service-account.json para cargar facturacion'
      );
    }
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
    const facturacion: SchoolFacturacion = await loadSchoolFacturacion(
      admin.firestore(),
      schoolIdArg
    );
    if (envArg === 'homo') {
      facturacion.afipProduction = false;
    }
    return {
      session: facturacionToAfipSession(facturacion),
      ptoVta: getPtoVta(facturacion),
      emisorLabel: `${facturacion.razonSocial} (${facturacion.cuit})`,
    };
  }

  const session = resolveAfipSessionFromEnv();
  const ptoVta = parseInt(process.env.AFIP_PTO_VTA ?? '1', 10) || 1;
  return {
    session,
    ptoVta,
    emisorLabel: `CUIT env ${session.cuit}`,
  };
}

function assertHomo(session: AfipSession): void {
  if (session.production && !allowProd) {
    throw new Error(
      'AFIP_PRODUCTION=true detectado. Smoke test bloqueado.\n' +
        '  Usá: npx tsx scripts/smoke-afip-homo.ts homo\n' +
        '  O --allow-prod solo si realmente querés correr contra producción.'
    );
  }
}

function preflightCerts(session: AfipSession): void {
  const missing: string[] = [];
  for (const [label, p] of [
    ['certificado', session.certPath],
    ['clave privada', session.keyPath],
  ] as const) {
    if (!fs.existsSync(p)) missing.push(`${label}: ${p}`);
  }
  if (missing.length) {
    throw new Error(
      `Certificados AFIP no encontrados:\n${missing.map((m) => `  - ${m}`).join('\n')}\n` +
        `Creá .env.afip.homo copiando .env.afip.homo.example`
    );
  }

  const certPathLower = session.certPath.toLowerCase();
  if (!session.production && (certPathLower.includes('_prod') || certPathLower.includes('/prod/'))) {
    console.warn(
      '[smoke] ⚠ Certificado de PRODUCCIÓN detectado en modo HOMOLOGACIÓN.\n' +
        '        WSAA homo rechazará certs prod. Configurá rutas homo en .env.afip.homo:\n' +
        '        AFIP_CERT_PATH=afip/certificado_homo.crt\n' +
        '        AFIP_KEY_PATH=afip/privada_homo.key\n' +
        '        AFIP_CHAIN_PATH=afip/chain.pem\n'
    );
  }
}

function printConfig(session: AfipSession, ptoVta: number, emisorLabel: string): void {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Nautic Admin — Smoke test ARCA WSFEv1');
  console.log(`  Manual referencia: FE v${WSFE_MANUAL_VERSION}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Ambiente   : ${session.production ? 'PRODUCCIÓN ⚠' : 'HOMOLOGACIÓN'}`);
  console.log(`  Emisor     : ${emisorLabel}`);
  console.log(`  PtoVta     : ${ptoVta}`);
  console.log(`  Emisión    : ${doEmit ? 'SÍ (--emit)' : 'NO (solo parámetros)'}`);
  console.log(`  Certificado: ${session.certPath}`);
  console.log('');
}

function printSummary(): void {
  console.log('\n──────────────────────────────────────────────────────');
  console.log('  RESUMEN');
  console.log('──────────────────────────────────────────────────────');
  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  for (const r of results) {
    const mark = r.ok ? '✓' : '✗';
    console.log(`  ${mark} [${r.id}] ${r.name} (${r.ms}ms)`);
    if (r.error) console.log(`      → ${r.error}`);
  }
  console.log('');
  console.log(`  Total: ${ok} OK, ${fail} fallidos de ${results.length}`);
  if (fail === 0) {
    console.log('\n  ✅ Smoke test completado.\n');
  } else {
    console.log('\n  ❌ Smoke test con errores — revisar arriba.\n');
  }
}

async function main(): Promise<void> {
  const { session, ptoVta, emisorLabel } = await resolveSession();
  assertHomo(session);
  preflightCerts(session);
  printConfig(session, ptoVta, emisorLabel);

  let condicionTable: Awaited<ReturnType<typeof getCondicionIvaReceptor>> = [];
  let lastVoucher = 0;
  let emittedNumber: number | null = null;
  let emittedCae: string | null = null;

  console.log('Pasos:\n');

  await runWithAfipSession(session, async () => {
    await step('wsaa', 'WSAA — obtener Token/Sign', async () => {
      const { token, sign } = await getAfipToken();
      if (!token || !sign) throw new Error('Token o Sign vacío');
      return `token ${token.length} chars`;
    });

    await step('cond-b', 'FEParamGetCondicionIvaReceptor (clase B)', async () => {
      const rows = await getCondicionIvaReceptor('B');
      if (rows.length === 0) throw new Error('Tabla vacía');
      condicionTable = rows;
      const cf = rows.find((r) => r.Id === CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL);
      if (!cf) throw new Error('No se encontró Consumidor Final (Id 5)');
      const v = validateCondicionForVoucherClass(
        CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
        'B',
        rows
      );
      if (!v.ok) throw new Error(v.error);
      return `${rows.length} condiciones; CF Cmp_Clase=${cf.Cmp_Clase ?? '?'}`;
    });

    await step('cond-a', 'FEParamGetCondicionIvaReceptor (clase A)', async () => {
      const rows = await getCondicionIvaReceptor('A');
      if (rows.length === 0) throw new Error('Tabla vacía');
      const ri = rows.find((r) => r.Id === CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO);
      if (!ri) throw new Error('No se encontró RI (Id 1)');
      return `${rows.length} condiciones; RI permitido en A`;
    });

    await step('cotiz-usd', 'FEParamGetCotizacion — DOL (USD)', async () => {
      const result = await fetchArcaCotizacion(getCotizacion, 'DOL', new Date());
      return `${result.cotizacionFecha} → $${result.cotizacion} ARS/USD` +
        (result.attemptedDates.length > 1
          ? ` (fallback desde ${result.attemptedDates[0]})`
          : '');
    });

    await step('ultimo-b', 'FECompUltimoAutorizado — Factura B', async () => {
      lastVoucher = await getLastVoucher(ptoVta, CBTE_TIPO.FACTURA_B);
      return `último nro ${lastVoucher}, siguiente ${lastVoucher + 1}`;
    });

    if (doEmit) {
      await step('emit-b', 'FECAESolicitar — Factura B mínima ($121 CF)', async () => {
        const impTotal = 121;
        const amounts = calculateFiscalAmounts(impTotal, CBTE_TIPO.FACTURA_B);
        const fecha = new Date();
        const cbteFch =
          fecha.getFullYear() * 10000 + (fecha.getMonth() + 1) * 100 + fecha.getDate();

        const docNro = parseInt(
          (process.env.FACTURA_RECEPTOR_CUIT ?? '20257159702').replace(/\D/g, ''),
          10
        );
        if (docNro.toString().length !== 11) {
          throw new Error('FACTURA_RECEPTOR_CUIT debe ser CUIT válido de 11 dígitos para emisión B');
        }

        emittedNumber = lastVoucher + 1;

        const params = {
          PtoVta: ptoVta,
          CbteTipo: CBTE_TIPO.FACTURA_B,
          Concepto: 2,
          DocTipo: 80,
          DocNro: docNro,
          CondIVAReceptor: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
          CbteDesde: emittedNumber,
          CbteHasta: emittedNumber,
          CbteFch: cbteFch,
          ImpTotal: amounts.impTotal,
          ImpTotConc: amounts.impTotConc,
          ImpNeto: amounts.impNeto,
          ImpOpEx: amounts.impOpEx,
          ImpIVA: amounts.impIva,
          ImpTrib: amounts.impTrib,
          MonId: 'PES',
          MonCotiz: 1,
          Iva: amounts.iva,
        };

        const xmlPreview = buildFecaDetRequestXml(params);
        console.log('\n    Request FECAEDetRequest (sanitizado):');
        console.log(xmlPreview.trim().replace(/^/gm, '      '));

        const result = await createVoucher(params);
        if (result.resultado.toUpperCase() !== 'A' || !result.cae) {
          throw new Error(
            `Emisión no aprobada: Resultado=${result.resultado}, CAE=${result.cae || '(vacío)'}`
          );
        }
        emittedCae = result.cae;
        const obs =
          result.observaciones.length > 0
            ? ` obs=[${result.observaciones.map((o) => o.code).join(',')}]`
            : '';
        return `nro ${emittedNumber} CAE ${result.cae} vto ${result.caeFchVto}${obs}`;
      });

      if (emittedNumber != null) {
        await step('consult', 'FECompConsultar — idempotencia post-emisión', async () => {
          const c = await consultVoucher(ptoVta, CBTE_TIPO.FACTURA_B, emittedNumber!);
          if (!c || c.resultado.toUpperCase() !== 'A' || !c.cae) {
            throw new Error('No se recuperó comprobante autorizado vía FECompConsultar');
          }
          if (emittedCae && c.cae !== emittedCae) {
            throw new Error(`CAE consultado (${c.cae}) ≠ CAE emitido (${emittedCae})`);
          }
          return `CAE ${c.cae} confirmado`;
        });
      }
    } else {
      console.log('  ⏭ Emisión omitida (agregá --emit para Factura B de prueba)\n');
    }
  });

  printSummary();
  if (results.some((r) => !r.ok)) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Error fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
