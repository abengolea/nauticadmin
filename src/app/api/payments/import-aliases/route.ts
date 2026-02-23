/**
 * POST /api/payments/import-aliases
 * Carga alias pagador → cliente desde Excel (ej. extracto Visa con columna de pagador).
 * Col A: apellido cliente, Col B: nombre cliente, Col G: pagador.
 * Crea/actualiza recPayerAliases (sistema de conciliación) para matching en imports de pagos.
 * Solo school_admin o super_admin.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import {
  REC_COLLECTIONS,
  normalizeName as recNormalizeName,
  normalizeAndTokenize,
  tokenSetRatio,
} from '@/lib/reconciliation';

type ColumnMapping = {
  colApellido: number;
  colNombre: number;
  colPagador: number;
};

/** Normaliza para comparación: igual que import-excel pero con puntos/signos → espacio */
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

/** Si el nombre completo está en una sola columna, prueba apellido=primera palabra, nombre=resto y viceversa */
function splitFullName(full: string): { apellido: string; nombre: string }[] {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [{ apellido: full.trim(), nombre: '' }];
  const uniq = new Map<string, { apellido: string; nombre: string }>();
  uniq.set(`${parts[0]}|${parts.slice(1).join(' ')}`, { apellido: parts[0] ?? '', nombre: parts.slice(1).join(' ') });
  uniq.set(`${parts.slice(0, -1).join(' ')}|${parts[parts.length - 1]}`, { apellido: parts.slice(0, -1).join(' '), nombre: parts[parts.length - 1] ?? '' });
  return Array.from(uniq.values());
}

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { schoolId, rows, columns } = body as {
      schoolId?: string;
      rows?: (string | number)[][];
      columns?: ColumnMapping;
    };

    if (!schoolId || !Array.isArray(rows) || !columns) {
      return NextResponse.json(
        { error: 'Faltan schoolId, rows o columns (colApellido, colNombre, colPagador)' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: 'Solo el administrador de la náutica puede cargar alias de conciliación' },
        { status: 403 }
      );
    }

    const playersSnap = await db.collection(`schools/${schoolId}/players`).get();
    const byNormalizedName = new Map<string, { id: string }>();
    type PlayerForFuzzy = { id: string; tokens: string[]; norm: string };
    const playersForFuzzy: PlayerForFuzzy[] = [];

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
      const { normalized, tokens } = normalizeAndTokenize(fullName || altName);
      if (tokens.length > 0) {
        playersForFuzzy.push({ id: doc.id, tokens, norm: normalized });
      }
    }

    const aliasesRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.payerAliases);

    const existingAliasesSnap = await aliasesRef.get();
    const existingAliases = new Map<string, string>();
    for (const d of existingAliasesSnap.docs) {
      const data = d.data() as { normalized_payer_name?: string; player_id?: string };
      if (data.normalized_payer_name && data.player_id) {
        existingAliases.set(data.normalized_payer_name, data.player_id);
      }
    }

    function resolvePlayerId(
      apellido: string,
      nombre: string,
      clienteFull: string
    ): string | undefined {
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
          if (top1 && top1.score >= 75 && (!top2 || top1.score - top2.score >= 8)) {
            return top1.id;
          }
        }
      }
      return undefined;
    }

    type NotFoundItem = { clienteFull: string; pagador: string };
    const notFound: NotFoundItem[] = [];
    const notFoundStrings: string[] = [];
    const skipped: string[] = [];
    const conflicts: string[] = [];

    type PayerAssignment = { playerId: string; clienteFull: string };
    const payerToAssignments = new Map<string, PayerAssignment[]>();

    const pendingRef = db
      .collection('schools')
      .doc(schoolId)
      .collection(REC_COLLECTIONS.pendingPayerAliases);

    for (const row of rows) {
      let apellido = String(row[columns.colApellido] ?? '').trim();
      let nombre = String(row[columns.colNombre] ?? '').trim();
      const pagador = String(row[columns.colPagador] ?? '').trim();

      if (!pagador) continue;

      if (apellido === nombre && apellido) {
        nombre = '';
      }
      const clienteFull = `${apellido} ${nombre}`.trim() || apellido || nombre;
      if (!clienteFull) {
        skipped.push(`Fila sin cliente (pagador: ${pagador})`);
        continue;
      }

      const playerId = resolvePlayerId(apellido, nombre, clienteFull);
      if (!playerId) {
        notFound.push({ clienteFull, pagador });
        notFoundStrings.push(`${clienteFull} (pagador: ${pagador})`);
        continue;
      }

      const payerNorm = recNormalizeName(pagador);
      const list = payerToAssignments.get(payerNorm) ?? [];
      if (!list.some((a) => a.playerId === playerId && a.clienteFull === clienteFull)) {
        list.push({ playerId, clienteFull });
        payerToAssignments.set(payerNorm, list);
      }
    }

    let created = 0;
    let updated = 0;

    for (const [payerNorm, assignments] of payerToAssignments) {
      const uniquePlayerIds = [...new Set(assignments.map((a) => a.playerId))];

      if (uniquePlayerIds.length > 1) {
        const clientes = assignments.map((a) => `${a.clienteFull}`).join(', ');
        conflicts.push(
          `"${payerNorm}" aparece como pagador de varios clientes: ${clientes}. Revisar manualmente.`
        );
        continue;
      }

      const playerId = uniquePlayerIds[0]!;
      const clienteFull = assignments[0]!.clienteFull;

      const existingPlayerId = existingAliases.get(payerNorm);
      if (existingPlayerId && existingPlayerId !== playerId) {
        conflicts.push(
          `"${payerNorm}" ya está asignado a otro cliente. En este Excel figura para "${clienteFull}". Revisar manualmente.`
        );
        continue;
      }

      const aliasId = payerNorm.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 150);
      const aliasRef = aliasesRef.doc(aliasId);
      const existing = await aliasRef.get();
      const now = new Date().toISOString();
      const docData = {
        normalized_payer_name: payerNorm,
        player_id: playerId,
        updated_at: now,
        updated_by: uid,
      };

      if (existing.exists) {
        const prev = existing.data() as { player_id?: string };
        if (prev.player_id !== playerId) {
          await aliasRef.update(docData);
          updated++;
        }
      } else {
        await aliasRef.set({
          ...docData,
          created_at: now,
          created_by: uid,
        });
        created++;
      }
    }

    const now = new Date().toISOString();
    for (const item of notFound) {
      const docId = `${recNormalizeName(item.pagador).slice(0, 80)}_${recNormalizeName(item.clienteFull).slice(0, 60)}`
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .slice(0, 150);
      await pendingRef.doc(docId).set(
        {
          pagador_raw: item.pagador,
          cliente_raw: item.clienteFull,
          created_at: now,
          created_by: uid,
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      ok: true,
      created,
      updated,
      notFound: notFoundStrings.slice(0, 100),
      notFoundCount: notFound.length,
      conflicts: conflicts.slice(0, 50),
      conflictsCount: conflicts.length,
      skipped: skipped.slice(0, 30),
      message: `Se cargaron ${created} alias nuevos y se actualizaron ${updated}.${notFound.length > 0 ? ` ${notFound.length} no encontrados guardados en Sin match para asignar manualmente.` : ''}${conflicts.length > 0 ? ` ${conflicts.length} conflictos (pagador con varios clientes) para revisar.` : ''}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/payments/import-aliases]', e);
    return NextResponse.json(
      { error: 'Error al cargar alias', detail: message },
      { status: 500 }
    );
  }
}
