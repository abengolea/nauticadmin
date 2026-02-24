/**
 * GET /api/solicitud-embarcacion/sugerencias?q=xxx&tipo=nombre|embarcacion&nombreCliente=yyy
 * Sugerencias de nombres de clientes y embarcaciones desde los players de la escuela.
 * Público (sin auth) - usa la primera escuela activa.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get('q') ?? '').trim().toLowerCase();
    const tipo = searchParams.get('tipo'); // nombre | embarcacion
    const nombreCliente = String(searchParams.get('nombreCliente') ?? '').trim();
    const schoolIdParam = searchParams.get('schoolId')?.trim();

    if (!tipo || !['nombre', 'embarcacion'].includes(tipo)) {
      return NextResponse.json({ error: 'tipo debe ser nombre o embarcacion' }, { status: 400 });
    }

    const db = getAdminFirestore();
    let schoolId = schoolIdParam;

    if (!schoolId) {
      const schoolsSnap = await db
        .collection('schools')
        .where('status', '==', 'active')
        .limit(1)
        .get();
      if (schoolsSnap.empty) {
        return NextResponse.json({ sugerencias: [] });
      }
      schoolId = schoolsSnap.docs[0].id;
    }
    const playersSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('players')
      .get();

    const players = playersSnap.docs
      .map((d) => d.data() as {
        firstName?: string;
        lastName?: string;
        embarcacionNombre?: string;
        embarcacionMatricula?: string;
        embarcaciones?: Array<{ nombre?: string; matricula?: string }>;
        archived?: boolean;
      })
      .filter((p) => !p.archived && (p.firstName || p.lastName));

    if (tipo === 'nombre') {
      const nombres = new Set<string>();
      for (const p of players) {
        const full = `${(p.firstName ?? '').trim()} ${(p.lastName ?? '').trim()}`.trim();
        if (full && (!q || full.toLowerCase().includes(q))) {
          nombres.add(full);
        }
      }
      const sugerencias = Array.from(nombres).sort().slice(0, 15);
      return NextResponse.json({ sugerencias });
    }

    // tipo === embarcacion (si hay nombreCliente, mostrar todas sus embarcaciones aunque q esté vacío)
    const embarcaciones = new Set<string>();
    const qMatch = q.length > 0;
    for (const p of players) {
      const nombreFull = `${(p.firstName ?? '').trim()} ${(p.lastName ?? '').trim()}`.trim();
      if (nombreCliente && nombreFull.toLowerCase() !== nombreCliente.toLowerCase()) continue;
      const embs = p.embarcaciones?.length
        ? p.embarcaciones.map((e) => [(e.nombre ?? '').trim(), (e.matricula ?? '').trim()]).flat()
        : [(p.embarcacionNombre ?? '').trim(), (p.embarcacionMatricula ?? '').trim()];
      for (const v of embs) {
        if (v && (!qMatch || v.toLowerCase().includes(q))) embarcaciones.add(v);
      }
    }
    const sugerencias = Array.from(embarcaciones).sort().slice(0, 15);
    return NextResponse.json({ sugerencias });
  } catch (e) {
    console.error('[solicitud-embarcacion/sugerencias]', e);
    return NextResponse.json({ sugerencias: [] });
  }
}
