/**
 * GET /api/afip/auth
 * Obtiene token WSAA de AFIP (homologación).
 * Prueba la conexión directa con AFIP usando certificado digital.
 */

import { NextResponse } from 'next/server';
import { getAfipToken, WsaaError } from '@/lib/afip/wsaa';

export async function GET() {
  try {
    const result = await getAfipToken();

    return NextResponse.json({
      ok: true,
      token: result.token,
      sign: result.sign,
    });
  } catch (err) {
    if (err instanceof WsaaError) {
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          code: err.code,
          details: err.details,
        },
        { status: 400 }
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/afip/auth]', err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
