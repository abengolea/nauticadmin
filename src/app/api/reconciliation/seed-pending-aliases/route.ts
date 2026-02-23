/**
 * POST /api/reconciliation/seed-pending-aliases
 * Carga la lista de alias pendientes (Cuenta + Pagador) desde el seed para asignar manualmente.
 * Formato: Cuenta (cliente), Pagador
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { REC_COLLECTIONS } from '@/lib/reconciliation';

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

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { schoolId } = body as { schoolId?: string };
    if (!schoolId) {
      return NextResponse.json({ error: 'Falta schoolId' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const uid = auth.uid;

    const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${uid}`).get();
    const platformUserSnap = await db.doc(`platformUsers/${uid}`).get();
    const isSchoolAdmin =
      schoolUserSnap.exists &&
      (schoolUserSnap.data() as { role?: string })?.role === 'school_admin';
    const isSuperAdmin =
      platformUserSnap.exists &&
      (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true;

    if (!isSchoolAdmin && !isSuperAdmin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const pendingRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.pendingPayerAliases);

    const rows = ALIASES_CSV.trim().split('\n').filter(Boolean);
    const now = new Date().toISOString();
    let saved = 0;

    for (const line of rows) {
      const idx = line.indexOf(',');
      if (idx < 0) continue;
      const clienteFull = line.slice(0, idx).trim();
      const pagador = line.slice(idx + 1).trim();
      if (!clienteFull || !pagador) continue;

      const docId = `${recNormalizeName(pagador).slice(0, 80)}_${recNormalizeName(clienteFull).slice(0, 60)}`
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .slice(0, 150);

      await pendingRef.doc(docId).set(
        {
          pagador_raw: pagador,
          cliente_raw: clienteFull,
          created_at: now,
          created_by: uid,
        },
        { merge: true }
      );
      saved++;
    }

    return NextResponse.json({
      ok: true,
      saved,
      message: `Se cargaron ${saved} alias pendientes en Sin match para asignar manualmente.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[reconciliation/seed-pending-aliases]', e);
    return NextResponse.json(
      { error: 'Error al cargar pendientes', detail: message },
      { status: 500 }
    );
  }
}
