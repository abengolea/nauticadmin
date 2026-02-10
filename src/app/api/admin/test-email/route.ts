/**
 * POST /api/admin/test-email
 * Escribe un documento de prueba en la colección `mail` para verificar que
 * la extensión Trigger Email (firestore-send-email) envía correos.
 * Solo super admin.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";

const MAIL_COLLECTION = "mail";

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth?.uid) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const db = getAdminFirestore();
    const platformUserSnap = await db.doc(`platformUsers/${auth.uid}`).get();
    const platformData = platformUserSnap.data() as { super_admin?: boolean } | undefined;
    const isSuperAdmin =
      platformData?.super_admin === true || auth.email === "abengolea1@gmail.com";

    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Solo el super administrador puede enviar emails de prueba" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const to = typeof body?.to === "string" ? body.to.trim().toLowerCase() : "";
    if (!to || !to.includes("@")) {
      return NextResponse.json(
        { error: "Indicá un email válido (campo to)" },
        { status: 400 }
      );
    }

    const subject = "Prueba Trigger Email - Escuelas River SN";
    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0; padding:24px; font-family: sans-serif; font-size: 16px;">
  <p>Este es un <strong>email de prueba</strong>.</p>
  <p>Si lo recibiste, la extensión Trigger Email está funcionando correctamente.</p>
  <p style="margin-top:24px; font-size: 13px; color: #6b7280;">Enviado desde la página de prueba del panel de administración.</p>
</body>
</html>`;
    const text = "Este es un email de prueba. Si lo recibiste, la extensión Trigger Email está funcionando correctamente.";

    await db.collection(MAIL_COLLECTION).add({
      to,
      message: {
        subject,
        html,
        text,
      },
    });

    return NextResponse.json({ ok: true, message: "Documento creado en la colección mail. Revisá tu bandeja de entrada (y spam)." });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin/test-email]", e);
    return NextResponse.json(
      { error: "Error al crear el email de prueba", detail: message },
      { status: 500 }
    );
  }
}
