/**
 * POST /api/admin/update-user-password
 * Cambia la contraseña de un usuario (solo super admin).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore, getAdminAuth, FIREBASE_ADMIN_CREDENTIALS_ERROR } from '@/lib/firebase-admin';
import { verifySuperAdmin } from '@/lib/auth-server';
import { Timestamp } from 'firebase-admin/firestore';

const UpdatePasswordBodySchema = z.object({
  userId: z.string().min(1, 'El usuario es requerido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export async function POST(request: Request) {
  try {
    const auth = await verifySuperAdmin(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'Solo super admin puede cambiar contraseñas' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = UpdatePasswordBodySchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: firstError?.message ?? 'Datos inválidos' },
        { status: 400 }
      );
    }

    const { userId, password } = parsed.data;

    if (userId === auth.uid) {
      return NextResponse.json(
        { error: 'Para cambiar tu propia contraseña usá la configuración de tu cuenta.' },
        { status: 400 }
      );
    }

    const adminAuth = getAdminAuth();
    const db = getAdminFirestore();

    let targetEmail: string | undefined;
    try {
      const userRecord = await adminAuth.getUser(userId);
      targetEmail = userRecord.email;
      await adminAuth.updateUser(userId, { password });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err?.code === 'auth/user-not-found') {
        return NextResponse.json({ error: 'El usuario no existe en autenticación.' }, { status: 404 });
      }
      if (err?.code === 'auth/invalid-password') {
        return NextResponse.json(
          { error: 'La contraseña debe tener al menos 6 caracteres.' },
          { status: 400 }
        );
      }
      throw e;
    }

    await db.collection('auditLog').add({
      userId: auth.uid,
      userEmail: auth.email ?? '',
      action: 'platform_user.password_reset',
      resourceType: 'platformUser',
      resourceId: userId,
      schoolId: null,
      details: targetEmail ?? userId,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      message: `Contraseña actualizada para ${targetEmail ?? 'el usuario'}.`,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/admin/update-user-password]', e);
    if (message.includes('service-account') || message === FIREBASE_ADMIN_CREDENTIALS_ERROR) {
      return NextResponse.json({ error: FIREBASE_ADMIN_CREDENTIALS_ERROR }, { status: 503 });
    }
    return NextResponse.json(
      { error: message || 'Error al cambiar la contraseña' },
      { status: 500 }
    );
  }
}
