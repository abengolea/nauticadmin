/**
 * POST /api/reconciliacion-excel/analyze
 * La IA lee encabezados de un extracto y sugiere el mapeo de columnas.
 */

import '@/lib/load-env';
import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { analyzeReconciliationExcelWithAI } from '@/ai/flows/analyze-reconciliation-excel';
import { mappingFromAiResult } from '@/lib/reconciliacion-excel/column-mapping';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { schoolId, headers, sampleRows, fileName } = body as {
      schoolId?: string;
      headers?: string[];
      sampleRows?: string[][];
      fileName?: string;
    };

    if (!schoolId || !Array.isArray(headers) || !Array.isArray(sampleRows)) {
      return NextResponse.json(
        { error: 'Faltan schoolId, headers o sampleRows' },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const schoolUserSnap = await db.doc(`schools/${schoolId}/users/${auth.uid}`).get();
    const platformUserSnap = await db.doc(`platformUsers/${auth.uid}`).get();
    const isAdmin =
      (schoolUserSnap.exists &&
        (schoolUserSnap.data() as { role?: string })?.role === 'school_admin') ||
      (platformUserSnap.exists &&
        (platformUserSnap.data() as { super_admin?: boolean })?.super_admin === true);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
    }

    const cleanHeaders = headers.map((h) => String(h ?? '').trim());
    const cleanSamples = sampleRows.slice(0, 5).map((row) =>
      (Array.isArray(row) ? row : []).slice(0, 30).map((c) => String(c ?? '').trim().slice(0, 80))
    );

    const aiResult = await analyzeReconciliationExcelWithAI(
      cleanHeaders,
      cleanSamples,
      fileName
    );
    const mapping = mappingFromAiResult(cleanHeaders, aiResult);

    return NextResponse.json({
      ok: true,
      mapping,
      suggestedKind: aiResult.suggestedKind,
      suggestedProfileName: aiResult.suggestedProfileName,
      notes: aiResult.notes,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[reconciliacion-excel/analyze POST]', e);
    return NextResponse.json(
      { error: 'Error al analizar el archivo', detail: message },
      { status: 500 }
    );
  }
}
