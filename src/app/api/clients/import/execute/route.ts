/**
 * POST /api/clients/import/execute
 * Ejecuta la importación de clientes desde datos mapeados del Excel.
 * Requiere: school_admin de la náutica o super_admin.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { Timestamp } from 'firebase-admin/firestore';
import type { ExcelFieldKey } from '@/lib/excel-import-types';

type ColumnMapping = {
  columnIndex: number;
  columnHeader: string;
  systemField: ExcelFieldKey;
  confidence?: number;
};

function parseCreditoActivo(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  const s = String(val).toLowerCase().trim();
  if (['sí', 'si', 'yes', 'true', '1', 's', 'x'].includes(s)) return true;
  return false;
}

function parsePersonasAutorizadas(val: unknown): string[] {
  if (val === null || val === undefined) return [];
  const s = String(val).trim();
  if (!s) return [];
  return s.split(/[,;|\n]/).map((x) => x.trim()).filter(Boolean);
}

/** Convierte Excel serial (ej: 45812) a fecha legible (6/4/2025). Si ya es texto de fecha, lo deja igual. */
function excelSerialToDate(val: unknown): string {
  const str = String(val ?? '').trim();
  if (!str) return str;
  const num = parseFloat(str);
  if (!Number.isNaN(num) && str === String(num) && num >= 1 && num < 100000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    }
  }
  return str;
}

/** Convierte una fila del Excel a un objeto con los campos del sistema */
function rowToClientData(
  row: string[],
  mappings: ColumnMapping[]
): Record<string, string | boolean | string[] | undefined> {
  const data: Record<string, string | boolean | string[] | undefined> = {};
  for (const m of mappings) {
    const val = row[m.columnIndex];
    if (val === undefined || val === null) continue;
    const strVal = String(val).trim();
    if (!strVal) continue;

    switch (m.systemField) {
      case 'creditoActivo':
        data[m.systemField] = parseCreditoActivo(val);
        break;
      case 'personasAutorizadas':
        data[m.systemField] = parsePersonasAutorizadas(val);
        break;
      case 'clienteDesde':
        data[m.systemField] = excelSerialToDate(val);
        break;
      default:
        data[m.systemField] = strVal;
    }
  }
  return data;
}

/** Separa "Apellido Nombres" o "Razón Social" en firstName y lastName */
function splitApellidoNombres(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: 'Sin nombre', lastName: 'Importado' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Importado' };
  const lastName = parts[0];
  const firstName = parts.slice(1).join(' ');
  return { firstName: firstName || lastName, lastName };
}

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { schoolId, rows, mappings } = body as {
      schoolId?: string;
      rows?: string[][];
      mappings?: ColumnMapping[];
    };

    if (!schoolId || !Array.isArray(rows) || !Array.isArray(mappings)) {
      return NextResponse.json(
        { error: 'Faltan schoolId, rows o mappings' },
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
        { error: 'Solo el administrador de la náutica puede importar clientes' },
        { status: 403 }
      );
    }

    const playersRef = db.collection(`schools/${schoolId}/players`);
    const BATCH_LIMIT = 500;
    let created = 0;

    for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
      const chunk = rows.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();

    for (const row of chunk) {
      const data = rowToClientData(row, mappings);
      const apellidoNombres = (data.apellidoNombres as string) || '';
      const { firstName, lastName } = splitApellidoNombres(apellidoNombres);

      const observationsStr = [
        data.datosEmbarcacion,
        data.observaciones,
      ]
        .filter(Boolean)
        .join(' | ') || undefined;

      const emailRaw = (data.email as string)?.trim?.();
      const emailNorm = emailRaw?.includes?.('@') ? emailRaw.toLowerCase() : undefined;

      const playerData: Record<string, unknown> = {
        firstName,
        lastName,
        tutorContact: {
          name: apellidoNombres || 'Sin datos',
          phone: (data.telefono as string)?.trim() || '',
        },
        status: 'active',
        createdAt: Timestamp.now(),
        createdBy: uid,
        ...(emailNorm && { email: emailNorm }),
        ...(observationsStr && { observations: observationsStr }),
        ...(data.nombreEmbarcacion && { embarcacionNombre: data.nombreEmbarcacion }),
        ...(data.matricula && { embarcacionMatricula: data.matricula }),
        ...(data.medidas && { embarcacionMedidas: data.medidas }),
        ...(data.lona && { embarcacionLona: data.lona }),
        ...(data.datosEmbarcacion && { embarcacionDatos: data.datosEmbarcacion }),
        ...(data.ubicacion && { ubicacion: data.ubicacion }),
        ...(data.clienteDesde && { clienteDesde: data.clienteDesde }),
        ...(data.creditoActivo !== undefined && { creditoActivo: data.creditoActivo }),
        ...(data.personasAutorizadas?.length && { personasAutorizadas: data.personasAutorizadas }),
      };

      const newRef = playersRef.doc();
      batch.set(newRef, playerData);
      created++;
    }

      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      created,
      message: `Se importaron ${created} clientes correctamente.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/clients/import/execute]', e);
    return NextResponse.json(
      { error: 'Error al importar clientes', detail: message },
      { status: 500 }
    );
  }
}
