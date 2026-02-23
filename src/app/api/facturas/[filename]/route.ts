/**
 * GET /api/facturas/[filename]
 * Sirve un PDF de la carpeta facturas/ para descargar.
 * Solo permite nombres seguros (factura-B-0001-00000001.pdf).
 */

import { NextResponse } from 'next/server';
import * as path from 'path';
import * as fs from 'fs';
import { verifyIdToken } from '@/lib/auth-server';

const FACTURAS_DIR = path.resolve(process.cwd(), 'facturas');

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { filename } = await params;
    if (!filename || !/^factura-[BC]-\d{4}-\d{8}\.pdf$/.test(filename)) {
      return NextResponse.json({ error: 'Nombre de archivo inválido' }, { status: 400 });
    }

    const filepath = path.join(FACTURAS_DIR, filename);
    if (!fs.existsSync(filepath)) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
    }

    const buffer = fs.readFileSync(filepath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error('[api/facturas/download]', e);
    return NextResponse.json({ error: 'Error al descargar' }, { status: 500 });
  }
}
