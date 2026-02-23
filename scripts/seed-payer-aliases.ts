/**
 * Carga alias pagador → cliente en recPayerAliases.
 * Formato: Cuenta (cliente), Pagador
 *
 * Uso:
 *   SCHOOL_ID=tu-school-id npx tsx scripts/seed-payer-aliases.ts
 *
 * Requiere: service-account.json o GOOGLE_APPLICATION_CREDENTIALS
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import * as fs from 'fs';
import * as admin from 'firebase-admin';

const SCHOOL_ID = process.env.SCHOOL_ID?.trim();

const ALIASES_CSV = `ACKERMAN CARLOS R.,GRUPO GONZEMA SN SA
ALVAREZ LUCIANA I.,PONCE DIEGO
AROZA M. MANUELLA,AROZA JOAQUIN
ASEFF DANIEL I.,ROJAS MARIA EUGENIA
AZCOITIA JUAN PABLO,SAJ CONSTRUCCIONES SRL
BACALUSSO DIEGO F.,CODAR S.A.
BASUALDO MELANIE,GORLA CRISTIAN
BERNAL GUSTAVO. J.,BERNAL MANUELA
BERTORELLO MAXIMILIANO,MAXIMILIANO BERTORELO SRL
BIANCO MARCELA,FOURC SALVA
BILOS MARIANO J.,ROMA SERV. INT. S.A.
BONAVENTURA LUCAS,PLASBE SA
BRASI AGUSTIN,ESPINDOLA BENJAMIN
BRAVO RAUL,BRAVO DANIEL
BUGALLO MARIA C,SERVICIOA PORTUARIOS S.A.
BUYS GUILLERMO J.,PERELLI CONSTANZA
DOMINGUEZ MATIAS I.,PAGA MOTO VIAPIANO+ NC LAN CAT3
DOTTI WALTER M.,SEGURIDAD DEL LITORAL
FERRELLI JUAN CARLOS,CHELLI
FERRIERI LUIS ARMANDO,ALMLS
FOGLIA NICOLAS,FOGLIA NESTOR EDUARDO
FORGUES ANASTACIA,FELICEVICH DARIO
GIRON JUAN IGNACIO,GIRON JORGE LUIS
GIUGGIA LEANDRO  R.,BRAHGETTO S.A.
GONZALEZ MARIO F.,GONZALEZ MARTIN
GONZALEZ VIDAL FRANCISCO,AGROPECUARIA EL MACA DEL NORTE
GUTIERREZ SILVIA M.,GACEO
JACOB PABLO L.,PLD SERVICIOS INDUSTRIALES
KATZ GERARDO I.,KATZ MARCOS DAMIAN
KESSEL GUSTAVO M.,SASSANO MARCELO ALEJANDRO
LOPEZ LUCIANO A.,LOPEZ ARIEL EDGARDO
MANSILLA MATIAS R.,SUCESION DE MANSILLA RUBEN
MARCELO CECILIA,TRANSPORTE MARCELO SRL
MORENO ANTONIO A.,SALGADO A
MORENO HECTOR M.,ACOSTA JULIETA + MORENO MARCOS
MOZZONI JUAN P.,EXPOCEL PERGAMINO S.A.
PACIAROTTI LAURA N.,RAMOS
PASERO EZEQUIEL R.,POMBO
PINI RUBEN OSCAR,LESTAR
PRIMO JAVIER,KAYAK
RODRIGUEZ ANDREA S.,RODRIGUEZ STEFANIA
RODRIGUEZ ELBA Z.,DIDOMENICA PABLO
RODRIGUEZ JOAQUIN,SUCESION DE RODRIGUEZ ANGEL ANIBAL
RUIZ FERNANDO D.,CEJAS GARCIA
SCAGLIA JUAN CARLOS,SERVICIOS PORTUARIOS S.A.
SHUTTE VALERIA,CATANIA DANIEL
TABARES MARIA PAZ,CASTILLO MARINA ALEJANDRO DAMIAN
TIELLI MATIAS E.,MARCELO maria florencia +
TISCHLER ANA E.,CASTELLI
TOLOZA CINTIA N.,BOCOLLI
TORELLA PABLO R.,CONYGAS S.A.
URRUCHUA MATIAS E.,URRUCHUA + gonzalez edgardo
URRUTY DARIO P.,MENENDEZ CECILIA RITA
VELAZQUEZ PRSICILA,ERNST EZEQUIEL
VELAZQUEZ SEBASTIANA,VELAZQUEZ RICARDO
VENZI VIRGINIA M.,BARON CONSTANTINO
WEISS MARIA VALENTINA,TESSI OSCAR
WIRZT JUAN PABLO,BERGESSIO
OROZA PEREYRA ALVARO,RED OROZA`;

function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[.,;:\-_/\\()\[\]{}'"]/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function recNormalizeName(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:\-_/\\()\[\]{}'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameVariants(apellido: string, nombre: string): string[] {
  const a = apellido.trim();
  const n = nombre.trim();
  const variants: string[] = [];
  if (a || n) {
    const an = `${a} ${n}`.trim();
    const na = `${n} ${a}`.trim();
    variants.push(normalize(an));
    if (na !== an) variants.push(normalize(na));
  }
  return variants;
}

function splitFullName(full: string): { apellido: string; nombre: string }[] {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [{ apellido: full.trim(), nombre: '' }];
  const uniq = new Map<string, { apellido: string; nombre: string }>();
  uniq.set(`${parts[0]}|${parts.slice(1).join(' ')}`, { apellido: parts[0] ?? '', nombre: parts.slice(1).join(' ') });
  uniq.set(`${parts.slice(0, -1).join(' ')}|${parts[parts.length - 1]}`, { apellido: parts.slice(0, -1).join(' '), nombre: parts[parts.length - 1] ?? '' });
  return Array.from(uniq.values());
}

function resolveCredentialsPath(): string {
  const cwd = process.cwd();
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    const absolute = path.isAbsolute(envPath) ? envPath : path.join(cwd, envPath);
    if (fs.existsSync(absolute)) return absolute;
  }
  const candidates = [path.join(cwd, 'service-account.json')];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

async function main() {
  if (admin.apps.length === 0) {
    const credentialsPath = resolveCredentialsPath();
    if (!credentialsPath) {
      console.error('No se encontró service-account.json. Ponelo en la raíz del proyecto.');
      process.exit(1);
    }
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }

  const db = admin.firestore();

  if (!SCHOOL_ID) {
    console.log('SCHOOL_ID no definido. Listando escuelas disponibles:\n');
    const schoolsSnap = await db.collection('schools').get();
    for (const doc of schoolsSnap.docs) {
      const playersSnap = await db.collection(`schools/${doc.id}/players`).get();
      const name = (doc.data() as { name?: string }).name ?? doc.id;
      console.log(`  ${doc.id}  →  ${name}  (${playersSnap.size} jugadores)`);
    }
    console.log('\nEjecutá: SCHOOL_ID=id-de-la-escuela npm run seed:aliases');
    process.exit(1);
  }

  const REC_COLLECTIONS = { payerAliases: 'recPayerAliases' };

  const playersSnap = await db.collection(`schools/${SCHOOL_ID}/players`).get();
  console.log(`\nEscuela ${SCHOOL_ID}: ${playersSnap.size} jugadores en la base.\n`);

  if (playersSnap.size === 0) {
    console.error('No hay jugadores en esta escuela. Verificá que SCHOOL_ID sea correcto.');
    console.error('El ID está en la URL: /dashboard/schools/[este-es-el-id]');
    process.exit(1);
  }

  const byNormalizedName = new Map<string, { id: string }>();

  const { normalizeAndTokenize, tokenSetRatio } = await import('../src/lib/reconciliation');
  type PlayerForFuzzy = { id: string; tokens: string[] };
  const playersForFuzzy: PlayerForFuzzy[] = [];

  const sampleNames: string[] = [];
  for (const doc of playersSnap.docs) {
    const d = doc.data() as { firstName?: string; lastName?: string; tutorContact?: { name?: string } };
    const fullName = (d.tutorContact?.name ?? `${d.lastName ?? ''} ${d.firstName ?? ''}`.trim()).trim();
    const altName = `${d.lastName ?? ''} ${d.firstName ?? ''}`.trim();

    for (const key of [normalize(fullName), normalize(altName)]) {
      if (key) byNormalizedName.set(key, { id: doc.id });
    }
    const variants = nameVariants(d.lastName ?? '', d.firstName ?? '');
    for (const v of variants) {
      if (v) byNormalizedName.set(v, { id: doc.id });
    }
    const { tokens } = normalizeAndTokenize(fullName || altName);
    if (tokens.length > 0) playersForFuzzy.push({ id: doc.id, tokens });
    if (sampleNames.length < 5) sampleNames.push(`${fullName || altName} → normalizado: "${normalize(fullName || altName)}"`);
  }

  console.log('Ejemplos de nombres en la base (cómo se buscan):');
  sampleNames.forEach((s) => console.log(`  ${s}`));
  console.log('');

  function resolvePlayerId(clienteFull: string): string | undefined {
    const parts = clienteFull.split(/\s+/).filter(Boolean);
    let apellido = parts[0] ?? '';
    let nombre = parts.slice(1).join(' ');

    let playerId: string | undefined;
    for (const key of nameVariants(apellido, nombre)) {
      const p = byNormalizedName.get(key);
      if (p) return p.id;
    }
    playerId = byNormalizedName.get(normalize(clienteFull))?.id;
    if (playerId) return playerId;
    for (const { apellido: ap, nombre: nom } of splitFullName(clienteFull)) {
      if (ap && nom) {
        for (const key of nameVariants(ap, nom)) {
          const p = byNormalizedName.get(key);
          if (p) return p.id;
        }
      }
    }
    if (playersForFuzzy.length > 0) {
      const { tokens: excelTokens } = normalizeAndTokenize(clienteFull);
      if (excelTokens.length > 0) {
        const excelTokensNoInitial = excelTokens.filter((t) => !/^[a-z]\.?$/i.test(t));
        const scored = playersForFuzzy.map((p) => {
          const s1 = tokenSetRatio(excelTokens, p.tokens);
          const s2 = excelTokensNoInitial.length > 0 ? tokenSetRatio(excelTokensNoInitial, p.tokens) : 0;
          return { id: p.id, score: Math.max(s1, s2) };
        });
        scored.sort((a, b) => b.score - a.score);
        const top1 = scored[0];
        const top2 = scored[1];
        if (top1 && top1.score >= 75 && (!top2 || top1.score - top2.score >= 8)) return top1.id;
      }
    }
    return undefined;
  }

  const payerToAssignments = new Map<string, { playerId: string; clienteFull: string }[]>();
  const notFound: string[] = [];
  const conflicts: string[] = [];

  const rows = ALIASES_CSV.trim().split('\n').filter(Boolean);
  for (const line of rows) {
    const idx = line.indexOf(',');
    if (idx < 0) continue;
    const clienteFull = line.slice(0, idx).trim();
    const pagador = line.slice(idx + 1).trim();
    if (!clienteFull || !pagador) continue;

    const playerId = resolvePlayerId(clienteFull);
    if (!playerId) {
      notFound.push(`${clienteFull} (pagador: ${pagador})`);
      continue;
    }

    const payerNorm = recNormalizeName(pagador);
    const list = payerToAssignments.get(payerNorm) ?? [];
    if (!list.some((a) => a.playerId === playerId)) {
      list.push({ playerId, clienteFull });
      payerToAssignments.set(payerNorm, list);
    }
  }

  const aliasesRef = db.collection('schools').doc(SCHOOL_ID).collection(REC_COLLECTIONS.payerAliases);
  const existingSnap = await aliasesRef.get();
  const existingByPayer = new Map<string, string>();
  for (const d of existingSnap.docs) {
    const data = d.data() as { normalized_payer_name?: string; player_id?: string };
    if (data.normalized_payer_name && data.player_id) {
      existingByPayer.set(data.normalized_payer_name, data.player_id);
    }
  }

  let created = 0;
  let updated = 0;

  for (const [payerNorm, assignments] of payerToAssignments) {
    const uniquePlayerIds = [...new Set(assignments.map((a) => a.playerId))];
    if (uniquePlayerIds.length > 1) {
      conflicts.push(`"${payerNorm}" → varios clientes: ${assignments.map((a) => a.clienteFull).join(', ')}`);
      continue;
    }

    const playerId = uniquePlayerIds[0]!;
    const existingPlayerId = existingByPayer.get(payerNorm);
    if (existingPlayerId && existingPlayerId !== playerId) {
      conflicts.push(`"${payerNorm}" ya asignado a otro cliente`);
      continue;
    }

    const aliasId = payerNorm.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 150);
    const now = new Date().toISOString();

    if (existingByPayer.has(payerNorm)) {
      await aliasesRef.doc(aliasId).update({ player_id: playerId, updated_at: now });
      updated++;
    } else {
      await aliasesRef.doc(aliasId).set({
        normalized_payer_name: payerNorm,
        player_id: playerId,
        created_at: now,
        created_by: 'seed-script',
      });
      created++;
    }
  }

  console.log(`\n✓ Alias creados: ${created}`);
  console.log(`✓ Alias actualizados: ${updated}`);
  if (notFound.length > 0) {
    console.log(`\n⚠ Clientes no encontrados: ${notFound.length}`);
    console.log('  El Excel tiene "APELLIDO NOMBRE" (ej: ACKERMAN CARLOS R.). La base debe tener el mismo formato.');
    console.log('  Verificá que los jugadores tengan firstName/lastName o tutorContact.name correctos.\n');
    notFound.slice(0, 15).forEach((n) => console.log(`  - ${n}`));
    if (notFound.length > 15) console.log(`  ... y ${notFound.length - 15} más`);
  }
  if (conflicts.length > 0) {
    console.log(`\n⚠ Conflictos (no asignados): ${conflicts.length}`);
    conflicts.forEach((c) => console.log(`  - ${c}`));
  }
  console.log('\nListo.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
