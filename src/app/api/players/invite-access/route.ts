/**
 * POST /api/players/invite-access
 * Crea cuentas de Firebase Auth (si no existen) y envía email con link para crear contraseña.
 * Solo school_admin o coach de la escuela.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/auth-server";
import {
  buildEmailHtmlServer,
  LOGO_ATTACHMENT_SERVER,
} from "@/lib/email-template-server";

const MAIL_COLLECTION = "mail";

function randomPassword(length = 20): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:9002";
}

export async function POST(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get("Authorization"));
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const schoolId = body?.schoolId as string | undefined;
    const playerIds = body?.playerIds as string[] | undefined;

    if (!schoolId || !Array.isArray(playerIds) || playerIds.length === 0) {
      return NextResponse.json(
        { error: "Faltan schoolId o playerIds (array no vacío)" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const adminAuth = getAdminAuth();

    const schoolUserSnap = await db
      .collection("schools")
      .doc(schoolId)
      .collection("users")
      .doc(auth.uid)
      .get();

    if (!schoolUserSnap.exists) {
      return NextResponse.json(
        { error: "No tenés permiso en esta náutica" },
        { status: 403 }
      );
    }

    const role = (schoolUserSnap.data() as { role?: string })?.role;
    if (role !== "school_admin" && role !== "coach") {
      return NextResponse.json(
        { error: "Solo el administrador o entrenador puede enviar invitaciones" },
        { status: 403 }
      );
    }

    const baseUrl = getBaseUrl();
    const loginUrl = `${baseUrl}/auth/login`;

    const results: { playerId: string; email: string; status: "sent" | "skipped" | "error"; detail?: string }[] = [];

    for (const playerId of playerIds) {
      const playerSnap = await db
        .collection("schools")
        .doc(schoolId)
        .collection("players")
        .doc(playerId)
        .get();

      if (!playerSnap.exists) {
        results.push({ playerId, email: "", status: "skipped", detail: "Jugador no encontrado" });
        continue;
      }

      const playerData = playerSnap.data() as { email?: string; firstName?: string; lastName?: string };
      const emailRaw = playerData?.email?.trim?.();
      const emailNorm = emailRaw?.toLowerCase();

      if (!emailNorm || !emailNorm.includes("@")) {
        results.push({
          playerId,
          email: emailRaw ?? "",
          status: "skipped",
          detail: "Sin email cargado",
        });
        continue;
      }

      try {
        let userExists = false;
        try {
          await adminAuth.getUserByEmail(emailNorm);
          userExists = true;
        } catch {
          // Usuario no existe
        }

        if (!userExists) {
          const password = randomPassword();
          await adminAuth.createUser({
            email: emailNorm,
            password,
            displayName: `${playerData.firstName ?? ""} ${playerData.lastName ?? ""}`.trim() || undefined,
          });
        }

        await db.collection("playerLogins").doc(emailNorm).set({
          schoolId,
          playerId,
        });

        const resetLink = await adminAuth.generatePasswordResetLink(emailNorm, {
          url: loginUrl,
        });

        const firstName = playerData.firstName ?? "Cliente";
        const contentHtml = `
          <p>Hola <strong>${firstName}</strong>,</p>
          <p>Te damos acceso al panel de tu náutica. Hacé clic en el enlace de abajo para crear tu contraseña e iniciar sesión:</p>
          <p style="margin: 20px 0;">
            <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #d4002a; color: white; text-decoration: none; font-weight: bold; border-radius: 6px;">Crear mi contraseña</a>
          </p>
          <p style="font-size: 14px; color: #6b7280;">El enlace es válido por 1 hora. Si no podés hacer clic, copiá y pegá este enlace en tu navegador:</p>
          <p style="font-size: 12px; word-break: break-all; color: #6b7280;">${resetLink}</p>
        `;

        const html = buildEmailHtmlServer(contentHtml, {
          title: "Acceso al panel - NauticAdmin",
          greeting: "Hola,",
        });

        const text = `Hola ${firstName}, te damos acceso al panel. Creá tu contraseña en: ${resetLink}`;

        await db.collection(MAIL_COLLECTION).add({
          to: emailNorm,
          message: {
            subject: "Acceso al panel de tu náutica - Creá tu contraseña",
            html,
            text,
            attachments: [LOGO_ATTACHMENT_SERVER],
          },
        });

        results.push({ playerId, email: emailNorm, status: "sent" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          playerId,
          email: emailNorm ?? "",
          status: "error",
          detail: msg,
        });
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const errors = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      ok: true,
      results,
      summary: { sent, skipped, errors },
      message:
        sent > 0
          ? `Se enviaron ${sent} invitación${sent !== 1 ? "es" : ""} correctamente.`
          : errors > 0
            ? "No se pudo enviar ninguna invitación."
            : "No hay jugadores con email para enviar.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/players/invite-access]", e);
    return NextResponse.json(
      { error: "Error al enviar invitaciones", detail: message },
      { status: 500 }
    );
  }
}
