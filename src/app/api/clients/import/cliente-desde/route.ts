/**
 * POST /api/clients/import/cliente-desde
 * Importa SOLO el campo "Cliente desde" (fecha) y lo asigna automáticamente a cada cliente.
 * Recibe un array de { apellidoNombres, clienteDesde } y hace match por nombre.
 * Requiere: school_admin de la náutica o super_admin.
 */

import { NextResponse } from 'next/server';
import type admin from 'firebase-admin';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';

type DocSnapshot = admin.firestore.DocumentSnapshot;
type DocRef = admin.firestore.DocumentReference;

type ClienteDesdeItem = {
  apellidoNombres: string;
  clienteDesde: string;
  /** Opcional: teléfono para match más preciso si hay duplicados */
  telefono?: string;
};

/** Normaliza string para comparación (quita acentos, espacios extra, minúsculas) */
function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
      items?: ClienteDesdeItem[];
    };

    if (!schoolId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Faltan schoolId o items (array de { apellidoNombres, clienteDesde })' },
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

    /** Mapa: clave normalizada -> doc snapshot (para match por nombre) */
    const byNormalizedName = new Map<string, DocSnapshot>();
    /** Mapa: teléfono normalizado -> doc snapshot (para match por teléfono) */
    const byPhone = new Map<string, DocSnapshot>();

    for (const doc of playersSnap.docs) {
      const d = doc.data() as {
        firstName?: string;
        lastName?: string;
        tutorContact?: { name?: string; phone?: string };
      };
      const fullName = (d.tutorContact?.name ?? `${d.lastName ?? ''} ${d.firstName ?? ''}`.trim()).trim();
      const altName = `${d.lastName ?? ''} ${d.firstName ?? ''}`.trim();
      const phone = (d.tutorContact?.phone ?? '').trim().replace(/\D/g, '');

      if (fullName) byNormalizedName.set(normalize(fullName), doc);
      if (altName && altName !== fullName) byNormalizedName.set(normalize(altName), doc);
      if (phone) byPhone.set(phone, doc);
    }

    let updated = 0;
    const notFound: string[] = [];
    const BATCH_LIMIT = 500;
    const updates: DocRef[] = [];
    const updateData: Record<string, string>[] = [];

    for (const item of items) {
      const apellidoNombres = (item.apellidoNombres ?? '').trim();
      const clienteDesde = (item.clienteDesde ?? '').trim();
      if (!apellidoNombres || !clienteDesde) continue;

      const keyNorm = normalize(apellidoNombres);
      let doc = byNormalizedName.get(keyNorm);

      if (!doc && item.telefono) {
        const phoneNorm = String(item.telefono).replace(/\D/g, '');
        if (phoneNorm) doc = byPhone.get(phoneNorm) ?? undefined;
      }

      if (!doc) {
        notFound.push(apellidoNombres);
        continue;
      }

      updates.push(doc.ref);
      updateData.push({ clienteDesde });
      updated++;
    }

    for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      const chunk = updates.slice(i, i + BATCH_LIMIT);
      const dataChunk = updateData.slice(i, i + BATCH_LIMIT);
      for (let j = 0; j < chunk.length; j++) {
        batch.update(chunk[j], dataChunk[j]);
      }
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      updated,
      notFound: notFound.slice(0, 50),
      notFoundCount: notFound.length,
      message: `Se actualizó "Cliente desde" en ${updated} clientes.${notFound.length > 0 ? ` ${notFound.length} no encontrados.` : ''}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/clients/import/cliente-desde]', e);
    return NextResponse.json(
      { error: 'Error al importar Cliente desde', detail: message },
      { status: 500 }
    );
  }
}
