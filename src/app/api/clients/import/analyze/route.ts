/**
 * POST /api/clients/import/analyze
 * Analiza las columnas de un Excel de clientes y devuelve el mapeo sugerido por IA.
 * Requiere: school_admin de la náutica o super_admin.
 */

import '@/lib/load-env';
import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { analyzeExcelColumnsWithAI } from '@/ai/flows/excel-import-analyze';

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { schoolId, headers, sampleRows } = body as {
      schoolId?: string;
      headers?: string[];
      sampleRows?: string[][];
    };

    if (!schoolId || !Array.isArray(headers) || !Array.isArray(sampleRows)) {
      return NextResponse.json(
        { error: 'Faltan schoolId, headers o sampleRows' },
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

    const result = await analyzeExcelColumnsWithAI(headers, sampleRows);

    return NextResponse.json({
      ok: true,
      mappings: result.mappings,
      suggestedFirstDataRow: result.suggestedFirstDataRow,
      notes: result.notes,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/clients/import/analyze]', e);
    return NextResponse.json(
      { error: 'Error al analizar el Excel', detail: message },
      { status: 500 }
    );
  }
}
