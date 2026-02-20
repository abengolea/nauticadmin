/**
 * POST /api/payments/import-excel
 * Importa pagos mensuales desde Excel (tarjeta crédito o débito).
 * Solo filas con Aplicada=Si se acreditan. Requiere school_admin o super_admin.
 */

import { NextResponse } from 'next/server';
import type admin from 'firebase-admin';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import {
  createPayment,
  updatePlayerStatus,
  getOrCreatePaymentConfig,
} from '@/lib/payments/db';
import { sendEmailEvent } from '@/lib/payments/email-events';
import { DEFAULT_CURRENCY } from '@/lib/payments/constants';
import { REC_COLLECTIONS, normalizeName as recNormalizeName } from '@/lib/reconciliation';

type DocSnapshot = admin.firestore.DocumentSnapshot;

type ColumnMapping = {
  colApellido: number;
  colNombre: number;
  colUsuarioId: number;
  colImporte: number;
  colAplicada: number;
  colObservaciones?: number;
  colNroTarjeta?: number;
};

function parseAplicada(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  const s = String(val).toLowerCase().trim();
  return ['sí', 'si', 'yes', 'true', '1', 's', 'x'].includes(s);
}

function parseAmount(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

/** Normaliza para comparación: minúsculas, sin acentos, sin comas, espacios simples */
function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .trim()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Genera todas las variantes de nombre para buscar (orden apellido+nombre, nombre+apellido, sin comas) */
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

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      schoolId,
      period,
      paymentMethod,
      rows,
      columns,
    } = body as {
      schoolId?: string;
      period?: string;
      paymentMethod?: 'credit' | 'debit';
      rows?: (string | number)[][];
      columns?: ColumnMapping;
    };

    if (!schoolId || !period || !paymentMethod || !Array.isArray(rows) || !columns) {
      return NextResponse.json(
        {
          error:
            'Faltan schoolId, period (YYYY-MM), paymentMethod (credit|debit), rows o columns',
        },
        { status: 400 }
      );
    }

    const periodMatch = /^\d{4}-\d{2}$/.exec(period);
    if (!periodMatch) {
      return NextResponse.json(
        { error: 'period debe ser YYYY-MM (ej: 2025-02)' },
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
        { error: 'Solo el administrador de la náutica puede importar pagos' },
        { status: 403 }
      );
    }

    const config = await getOrCreatePaymentConfig(db, schoolId);
    const currency = config.currency || DEFAULT_CURRENCY;

    const playersRef = db.collection(`schools/${schoolId}/players`);
    const playersSnap = await playersRef.get();

    const [aliasesSnap, recClientsSnap] = await Promise.all([
      db.collection('schools').doc(schoolId).collection(REC_COLLECTIONS.payerAliases).get(),
      db.collection('schools').doc(schoolId).collection(REC_COLLECTIONS.clients).get(),
    ]);

    const byUsuarioId = new Map<string, DocSnapshot>();
    const byNormalizedName = new Map<string, DocSnapshot>();

    for (const doc of playersSnap.docs) {
      const d = doc.data() as {
        firstName?: string;
        lastName?: string;
        usuarioId?: string;
        tutorContact?: { name?: string };
      };
      const usuarioId = String(d.usuarioId ?? '').trim();
      const fullName = (d.tutorContact?.name ?? `${d.lastName ?? ''} ${d.firstName ?? ''}`.trim()).trim();
      const altName = `${d.lastName ?? ''} ${d.firstName ?? ''}`.trim();

      if (usuarioId) byUsuarioId.set(usuarioId, doc);
      for (const key of [normalize(fullName), normalize(altName)]) {
        if (key) byNormalizedName.set(key, doc);
      }
      const variants = nameVariants(d.lastName ?? '', d.firstName ?? '');
      for (const v of variants) {
        if (v) byNormalizedName.set(v, doc);
      }
    }

    const recClientsById = new Map<string, { full_name_raw: string }>();
    for (const d of recClientsSnap.docs) {
      const data = d.data() as { full_name_raw?: string };
      if (data.full_name_raw) recClientsById.set(d.id, { full_name_raw: data.full_name_raw });
    }

    const recClientIdToPlayer = new Map<string, DocSnapshot>();
    for (const [clientId, rec] of recClientsById) {
      const raw = rec.full_name_raw;
      let ap = '';
      let nom = '';
      if (raw.includes(',')) {
        const parts = raw.split(',').map((p) => p.trim());
        ap = parts[0] ?? '';
        nom = parts.slice(1).join(' ').trim();
      } else {
        const parts = raw.trim().split(/\s+/);
        ap = parts[0] ?? '';
        nom = parts.slice(1).join(' ').trim();
      }
      for (const key of nameVariants(ap, nom)) {
        const playerDoc = byNormalizedName.get(key);
        if (playerDoc) {
          recClientIdToPlayer.set(clientId, playerDoc);
          break;
        }
      }
      if (!recClientIdToPlayer.has(clientId) && raw) {
        const playerDoc = byNormalizedName.get(normalize(raw));
        if (playerDoc) recClientIdToPlayer.set(clientId, playerDoc);
      }
    }

    const aliasToPlayer = new Map<string, DocSnapshot>();
    for (const d of aliasesSnap.docs) {
      const data = d.data() as { normalized_payer_name?: string; client_id?: string };
      const payerNorm = data.normalized_payer_name ?? '';
      const clientId = data.client_id ?? '';
      if (payerNorm && clientId) {
        const playerDoc = recClientIdToPlayer.get(clientId);
        if (playerDoc) aliasToPlayer.set(payerNorm, playerDoc);
      }
    }

    const unappliedRef = db.collection('schools').doc(schoolId).collection('unappliedPayments');
    let applied = 0;
    let unappliedCount = 0;
    const notFound: string[] = [];
    const skipped: string[] = [];
    type DocRef = admin.firestore.DocumentReference;
    const playerUpdates: { ref: DocRef; usuarioId: string }[] = [];

    let collectedByDisplayName = auth.email ?? 'Usuario';
    const schoolUserRef = db.doc(`schools/${schoolId}/users/${uid}`);
    const schoolUserSnap2 = await schoolUserRef.get();
    if (schoolUserSnap2.exists) {
      const dn = (schoolUserSnap2.data() as { displayName?: string })?.displayName?.trim();
      if (dn) collectedByDisplayName = dn;
    }

    for (const row of rows) {
      let apellido = String(row[columns.colApellido] ?? '').trim();
      let nombre = String(row[columns.colNombre] ?? '').trim();
      const usuarioId = String(row[columns.colUsuarioId] ?? '').trim();
      const importe = parseAmount(row[columns.colImporte]);
      const aplicada = parseAplicada(row[columns.colAplicada]);
      const observaciones = columns.colObservaciones != null
        ? String(row[columns.colObservaciones] ?? '').trim()
        : '';
      const nroTarjeta = columns.colNroTarjeta != null
        ? String(row[columns.colNroTarjeta] ?? '').trim()
        : undefined;

      if (!aplicada) {
        if (importe <= 0) continue;
        if (!nombre && apellido.includes(',')) {
          const parts = apellido.split(',').map((p) => p.trim());
          if (parts.length >= 2) {
            apellido = parts[0];
            nombre = parts.slice(1).join(' ').trim();
          }
        }
        const apellidoNombres = `${apellido} ${nombre}`.trim() || apellido || nombre;
        let docForUnapplied = usuarioId ? byUsuarioId.get(usuarioId) : undefined;
        if (!docForUnapplied) {
          for (const key of nameVariants(apellido, nombre)) {
            docForUnapplied = byNormalizedName.get(key);
            if (docForUnapplied) break;
          }
        }
        if (!docForUnapplied && apellidoNombres) {
          docForUnapplied = byNormalizedName.get(normalize(apellidoNombres));
        }
        if (!docForUnapplied && apellidoNombres) {
          docForUnapplied = aliasToPlayer.get(recNormalizeName(apellidoNombres));
        }
        const unappliedId = `ua_${period}_${paymentMethod}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        await unappliedRef.doc(unappliedId).set({
          schoolId,
          period,
          paymentMethod,
          payerRaw: apellidoNombres,
          playerId: docForUnapplied?.id ?? null,
          amount: importe,
          currency,
          observation: observaciones || 'Sin observación',
          importedAt: new Date().toISOString(),
          importedBy: uid,
        });
        unappliedCount++;
        continue;
      }

      if (importe <= 0) {
        skipped.push(`${apellido} ${nombre} (importe 0)`);
        continue;
      }

      if (!nombre && apellido.includes(',')) {
        const parts = apellido.split(',').map((p) => p.trim());
        if (parts.length >= 2) {
          apellido = parts[0];
          nombre = parts.slice(1).join(' ');
        }
      }

      const apellidoNombres = `${apellido} ${nombre}`.trim() || apellido || nombre;

      let doc = usuarioId ? byUsuarioId.get(usuarioId) : undefined;
      if (!doc) {
        for (const key of nameVariants(apellido, nombre)) {
          doc = byNormalizedName.get(key);
          if (doc) break;
        }
      }
      if (!doc && apellidoNombres) {
        doc = byNormalizedName.get(normalize(apellidoNombres));
      }
      if (!doc && apellidoNombres) {
        const payerNorm = recNormalizeName(apellidoNombres);
        doc = aliasToPlayer.get(payerNorm);
      }

      if (!doc) {
        notFound.push(apellidoNombres);
        continue;
      }

      const playerId = doc.id;

      const now = new Date();
      await createPayment(db, {
        playerId,
        schoolId,
        period,
        amount: importe,
        currency,
        provider: 'excel_import',
        status: 'approved',
        paidAt: now,
        metadata: {
          paymentMethod,
          usuarioId: usuarioId || undefined,
          nroTarjeta: nroTarjeta || undefined,
          collectedByUid: uid,
          collectedByDisplayName,
        },
      });

      await updatePlayerStatus(db, schoolId, playerId, 'active');
      applied++;

      const d = doc.data() as { usuarioId?: string };
      if (usuarioId && !d.usuarioId) {
        playerUpdates.push({ ref: doc.ref, usuarioId });
      }

      const playerData = doc.data() as { firstName?: string; lastName?: string; email?: string };
      const playerName = `${playerData.firstName ?? ''} ${playerData.lastName ?? ''}`.trim() || 'Cliente';
      const toEmail = playerData?.email;
      if (toEmail) {
        try {
          await sendEmailEvent({
            db: db as admin.firestore.Firestore,
            type: 'payment_receipt',
            playerId,
            schoolId,
            period,
            to: toEmail,
            playerName,
            amount: importe,
            currency,
            paidAt: now,
          });
        } catch {
          /* ignore */
        }
      }
    }

    for (const { ref, usuarioId } of playerUpdates) {
      await ref.update({ usuarioId });
    }

    const sampleDbNames =
      notFound.length > 0
        ? Array.from(byNormalizedName.keys()).slice(0, 15)
        : undefined;

    return NextResponse.json({
      ok: true,
      applied,
      unappliedCount,
      notFound: notFound.slice(0, 100),
      notFoundCount: notFound.length,
      skipped: skipped.slice(0, 30),
      skippedCount: skipped.length,
      sampleDbNames,
      message: `Se acreditaron ${applied} pagos para ${period}.${unappliedCount > 0 ? ` ${unappliedCount} no aplicados (con observaciones).` : ''}${notFound.length > 0 ? ` ${notFound.length} no encontrados.` : ''}${skipped.length > 0 ? ` ${skipped.length} omitidos.` : ''}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/payments/import-excel]', e);
    return NextResponse.json(
      { error: 'Error al importar pagos', detail: message },
      { status: 500 }
    );
  }
}
