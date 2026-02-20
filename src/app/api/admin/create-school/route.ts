/**
 * POST /api/admin/create-school
 * Crea una nueva náutica y su administrador (solo super admin).
 * Usa Firebase Admin SDK para crear el usuario, evitando el error 400 de identitytoolkit en cliente.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore, getAdminAuth } from '@/lib/firebase-admin';
import { verifySuperAdmin } from '@/lib/auth-server';
import { Timestamp } from 'firebase-admin/firestore';

const CreateSchoolBodySchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  city: z.string().min(2, 'La ciudad es requerida'),
  province: z.string().min(2, 'La provincia es requerida'),
  address: z.string().optional(),
  adminDisplayName: z.string().min(3, 'El nombre del administrador es requerido'),
  adminEmail: z.string().email('Email inválido'),
  adminPassword: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export async function POST(request: Request) {
  try {
    const auth = await verifySuperAdmin(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'Solo super admin puede crear náuticas' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = CreateSchoolBodySchema.safeParse(body);
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

    // 1. Crear usuario con Admin SDK (no depende de identitytoolkit del cliente)
    const newUser = await adminAuth.createUser({
      email: values.adminEmail,
      password: values.adminPassword,
      displayName: values.adminDisplayName,
    });

    // 2. Crear documentos en Firestore en un batch
    const batch = db.batch();

    const newSchoolRef = db.collection('schools').doc();
    batch.set(newSchoolRef, {
      name: values.name,
      city: values.city,
      province: values.province,
      address: values.address ?? '',
      status: 'active',
      createdAt: Timestamp.now(),
    });

    const schoolUserRef = db.collection('schools').doc(newSchoolRef.id).collection('users').doc(newUser.uid);
    batch.set(schoolUserRef, {
      displayName: values.adminDisplayName,
      email: values.adminEmail,
      role: 'school_admin',
    });

    const platformUserRef = db.collection('platformUsers').doc(newUser.uid);
    batch.set(platformUserRef, {
      email: values.adminEmail,
      super_admin: false,
      createdAt: Timestamp.now(),
    });

    await batch.commit();

    // 3. Audit log
    await db.collection('auditLog').add({
      userId: auth.uid,
      userEmail: auth.email ?? '',
      action: 'school.create',
      resourceType: 'school',
      resourceId: newSchoolRef.id,
      schoolId: null,
      details: values.name,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      schoolId: newSchoolRef.id,
      message: `Se creó la náutica "${values.name}" y se asignó a ${values.adminEmail} como administrador.`,
    });
  } catch (e: unknown) {
    const err = e as { code?: string | number; message?: string };
    const code = err?.code ?? '';
    const message = err?.message ?? String(e);

    console.error('[api/admin/create-school]', e);

    // 5 NOT_FOUND: Firestore no habilitado o base de datos no existe
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
        { error: 'El email del administrador ya está registrado. Elimínalo desde Firebase Console → Autenticación si fue un intento anterior fallido.' },
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
      { error: message || 'Error al crear la náutica' },
      { status: 500 }
    );
  }
}
