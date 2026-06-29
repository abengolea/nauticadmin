/**
 * POST /api/admin/create-school-user
 * Crea un usuario administrador/operador para una náutica existente (solo super admin).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore, getAdminAuth, FIREBASE_ADMIN_CREDENTIALS_ERROR } from '@/lib/firebase-admin';
import { verifySuperAdmin } from '@/lib/auth-server';
import { Timestamp } from 'firebase-admin/firestore';

const CreateSchoolUserBodySchema = z.object({
  schoolId: z.string().min(1, 'La náutica es requerida'),
  displayName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  role: z.enum(['school_admin', 'operador'], {
    required_error: 'El rol es requerido',
  }),
});

export async function POST(request: Request) {
  try {
    const auth = await verifySuperAdmin(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'Solo super admin puede crear usuarios' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = CreateSchoolUserBodySchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: firstError?.message ?? 'Datos inválidos' },
        { status: 400 }
      );
    }

    const values = parsed.data;
    const db = getAdminFirestore();
    const adminAuth = getAdminAuth();

    const schoolSnap = await db.collection('schools').doc(values.schoolId).get();
    if (!schoolSnap.exists) {
      return NextResponse.json({ error: 'La náutica no existe' }, { status: 404 });
    }

    const newUser = await adminAuth.createUser({
      email: values.email,
      password: values.password,
      displayName: values.displayName,
    });

    const batch = db.batch();

    const schoolUserRef = db
      .collection('schools')
      .doc(values.schoolId)
      .collection('users')
      .doc(newUser.uid);
    batch.set(schoolUserRef, {
      displayName: values.displayName,
      email: values.email,
      role: values.role,
    });

    const platformUserRef = db.collection('platformUsers').doc(newUser.uid);
    batch.set(platformUserRef, {
      email: values.email,
      super_admin: false,
      createdAt: Timestamp.now(),
    });

    await batch.commit();

    const schoolName = (schoolSnap.data() as { name?: string })?.name ?? values.schoolId;
    const roleLabel = values.role === 'school_admin' ? 'administrador' : 'operador';

    await db.collection('auditLog').add({
      userId: auth.uid,
      userEmail: auth.email ?? '',
      action: 'school_user.create',
      resourceType: 'platformUser',
      resourceId: newUser.uid,
      schoolId: values.schoolId,
      details: `${values.email} (${roleLabel}) en ${schoolName}`,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      userId: newUser.uid,
      message: `Se creó ${values.displayName} como ${roleLabel} de "${schoolName}".`,
    });
  } catch (e: unknown) {
    const err = e as { code?: string | number; message?: string };
    const code = err?.code ?? '';
    const message = err?.message ?? String(e);

    console.error('[api/admin/create-school-user]', e);

    if (message.includes('service-account') || message === FIREBASE_ADMIN_CREDENTIALS_ERROR) {
      return NextResponse.json({ error: FIREBASE_ADMIN_CREDENTIALS_ERROR }, { status: 503 });
    }

    if (err?.code === 5 || err?.message?.includes('NOT_FOUND')) {
      return NextResponse.json(
        {
          error:
            'Firestore no está configurado. Creá la base de datos en Firebase Console → Firestore Database → Create database.',
        },
        { status: 503 }
      );
    }

    if (code === 'auth/email-already-exists' || code === 'auth/uid-already-exists') {
      return NextResponse.json(
        {
          error:
            'Este email ya está registrado. Si un intento anterior falló, eliminá el usuario desde Firebase Console → Autenticación.',
        },
        { status: 400 }
      );
    }

    if (code === 'auth/invalid-password') {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: message || 'Error al crear el usuario' },
      { status: 500 }
    );
  }
}
