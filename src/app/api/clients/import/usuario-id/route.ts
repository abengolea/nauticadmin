/**
 * POST /api/clients/import/usuario-id
 * Vincula el Id Usuario (de la app de pagos) a cada cliente.
 * El Excel debe tener el nombre del CLIENTE (dueño de la embarcación), no del titular de la tarjeta.
 * Requiere: school_admin o super_admin.
 */

import { NextResponse } from 'next/server';
import type admin from 'firebase-admin';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';

type DocSnapshot = admin.firestore.DocumentSnapshot;

type UsuarioIdItem = {
  apellidoNombres: string;
  usuarioId: string;
};

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

function nameVariants(apellido: string, nombre: string): string[] {
  const a = apellido.trim();
  const n = nombre.trim();
  const variants: string[] = [];
  if (a || n) {
    variants.push(normalize(`${a} ${n}`.trim()));
    variants.push(normalize(`${n} ${a}`.trim()));
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
    const { schoolId, items } = body as {
      schoolId?: string;
      items?: UsuarioIdItem[];
    };

    if (!schoolId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Faltan schoolId o items (array de { apellidoNombres, usuarioId })' },
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
        { error: 'Solo el administrador de la náutica puede importar datos' },
        { status: 403 }
      );
    }

    const playersRef = db.collection(`schools/${schoolId}/players`);
    const playersSnap = await playersRef.get();

    const byNormalizedName = new Map<string, DocSnapshot>();
    for (const doc of playersSnap.docs) {
      const d = doc.data() as {
        firstName?: string;
        lastName?: string;
        tutorContact?: { name?: string };
      };
      const fullName = (d.tutorContact?.name ?? `${d.lastName ?? ''} ${d.firstName ?? ''}`.trim()).trim();
      for (const key of [normalize(fullName), ...nameVariants(d.lastName ?? '', d.firstName ?? '')]) {
        if (key) byNormalizedName.set(key, doc);
      }
    }

    let updated = 0;
    const notFound: string[] = [];
    const BATCH_LIMIT = 500;

    for (let i = 0; i < items.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      const chunk = items.slice(i, i + BATCH_LIMIT);

      for (const item of chunk) {
        let apellido = (item.apellidoNombres ?? '').trim();
        let nombre = '';
        if (apellido.includes(',')) {
          const parts = apellido.split(',').map((p) => p.trim());
          if (parts.length >= 2) {
            apellido = parts[0];
            nombre = parts.slice(1).join(' ');
          }
        }
        const usuarioId = String(item.usuarioId ?? '').trim();
        if (!usuarioId) continue;

        const apellidoNombres = `${apellido} ${nombre}`.trim() || apellido;
        let doc: DocSnapshot | undefined;
        for (const key of nameVariants(apellido, nombre)) {
          doc = byNormalizedName.get(key);
          if (doc) break;
        }
        if (!doc && apellidoNombres) {
          doc = byNormalizedName.get(normalize(apellidoNombres));
        }

        if (!doc) {
          notFound.push(apellidoNombres);
          continue;
        }

        batch.update(doc.ref, { usuarioId });
        updated++;
      }

      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      updated,
      notFound: notFound.slice(0, 50),
      notFoundCount: notFound.length,
      message: `Se vinculó Id Usuario en ${updated} clientes.${notFound.length > 0 ? ` ${notFound.length} no encontrados.` : ''}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/clients/import/usuario-id]', e);
    return NextResponse.json(
      { error: 'Error al vincular Id Usuario', detail: message },
      { status: 500 }
    );
  }
}
