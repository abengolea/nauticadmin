/**
 * POST /api/payments/[paymentId]/mark-invoiced-manual
 * Marca un pago como facturado cuando la factura fue cargada/emitida manualmente
 * (fuera del sistema: factura física, PDF subido, foto, otro sistema).
 * Acepta FormData con file (PDF o imagen) opcional: sube a Storage, extrae datos con IA y guarda todo.
 * Si no hay file, solo marca con los datos ingresados manualmente.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { COLLECTIONS } from '@/lib/payments/constants';
import { parseExpenseFromImage } from '@/ai/flows/parse-expense-invoice';
import { normalizeDate } from '@/lib/expenses/normalize';
import { z } from 'zod';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const formFieldsSchema = z.object({
  schoolId: z.string().min(1),
  facturaNumero: z.string().optional().transform((v) => {
    if (!v?.trim()) return undefined;
    const n = parseInt(v.trim(), 10);
    return Number.isNaN(n) ? undefined : n;
  }),
  facturaPtoVta: z.string().optional().transform((v) => {
    if (!v?.trim()) return undefined;
    const n = parseInt(v.trim(), 10);
    return Number.isNaN(n) ? undefined : n;
  }),
  facturaFecha: z.string().max(20).optional(),
  facturaTipo: z.string().max(50).optional(),
});

function parseFormFields(formData: FormData): z.infer<typeof formFieldsSchema> {
  const schoolId = formData.get('schoolId') as string | null;
  const facturaNumero = formData.get('facturaNumero') as string | null;
  const facturaPtoVta = formData.get('facturaPtoVta') as string | null;
  const facturaFecha = formData.get('facturaFecha') as string | null;
  const facturaTipo = formData.get('facturaTipo') as string | null;
  return formFieldsSchema.parse({
    schoolId: schoolId ?? '',
    facturaNumero: facturaNumero ?? undefined,
    facturaPtoVta: facturaPtoVta ?? undefined,
    facturaFecha: facturaFecha ?? undefined,
    facturaTipo: facturaTipo ?? undefined,
  });
}

function toIsoDate(val: string | undefined): string | undefined {
  if (!val?.trim()) return undefined;
  const normalized = normalizeDate(val);
  if (normalized) return normalized;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  return undefined;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { paymentId } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    let parsed: z.infer<typeof formFieldsSchema>;
    try {
      parsed = parseFormFields(formData);
    } catch {
      return NextResponse.json(
        { error: 'schoolId es requerido' },
        { status: 400 }
      );
    }

    const { schoolId, facturaNumero, facturaPtoVta, facturaFecha, facturaTipo } = parsed;

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const paymentRef = db.collection(COLLECTIONS.payments).doc(paymentId);
    const paymentSnap = await paymentRef.get();

    if (!paymentSnap.exists) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }

    const paymentData = paymentSnap.data()!;
    if (paymentData.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Pago no pertenece a esta escuela' }, { status: 403 });
    }
    if (paymentData.status !== 'approved') {
      return NextResponse.json(
        { error: 'Solo se pueden marcar como facturados los cobros aprobados' },
        { status: 400 }
      );
    }
    if (paymentData.facturado === true) {
      return NextResponse.json(
        { error: 'Este cobro ya está marcado como facturado' },
        { status: 400 }
      );
    }

    let finalNumero = facturaNumero;
    let finalPtoVta = facturaPtoVta;
    let finalFecha = facturaFecha ? toIsoDate(facturaFecha) : undefined;
    let finalTipo = facturaTipo?.trim();
    let storagePath: string | undefined;

    if (file && file.size > 0) {
      const contentType = file.type || 'application/octet-stream';
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const isPdf = contentType === 'application/pdf' || ext === 'pdf';
      const isImage = contentType.startsWith('image/');

      if (!ALLOWED_TYPES.includes(contentType) && !isPdf && !isImage) {
        return NextResponse.json(
          { error: 'Formato no permitido. Usá PDF, JPG, PNG o WebP.' },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'El archivo no puede superar 10MB.' },
          { status: 400 }
        );
      }

      const storage = getAdminStorage();
      const bucket = storage.bucket();
      const safeExt = ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'pdf';
      storagePath = `schools/${schoolId}/payments/${paymentId}/factura-manual.${safeExt}`;
      const fileRef = bucket.file(storagePath);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fileRef.save(buffer, {
        metadata: { contentType },
      });

      try {
        const base64 = buffer.toString('base64');
        const result = await parseExpenseFromImage(base64, contentType);
        const inv = result.extracted.invoice;
        if (inv) {
          if (finalNumero == null && inv.number) {
            const n = parseInt(String(inv.number).replace(/\D/g, ''), 10);
            if (!Number.isNaN(n)) finalNumero = n;
          }
          if (finalPtoVta == null && inv.pos) {
            const p = parseInt(String(inv.pos).replace(/\D/g, ''), 10);
            if (!Number.isNaN(p)) finalPtoVta = p;
          }
          if (!finalFecha && inv.issueDate) {
            finalFecha = toIsoDate(inv.issueDate);
          }
          if (!finalTipo && (inv.type || inv.letter)) {
            finalTipo = inv.type?.trim() || `Factura ${inv.letter || ''}`.trim();
          }
        }
      } catch (parseErr) {
        console.warn('[mark-invoiced-manual] IA extraction failed, using manual data only:', parseErr);
      }
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      facturado: true,
      facturadoAt: now,
      facturaManual: true,
      updatedAt: now,
    };
    if (finalNumero != null && finalNumero > 0) updateData.facturaNumero = finalNumero;
    if (finalPtoVta != null && finalPtoVta > 0) updateData.facturaPtoVta = finalPtoVta;
    if (finalFecha) updateData.facturaFecha = finalFecha;
    if (finalTipo) updateData.facturaTipo = finalTipo;
    if (storagePath) updateData.facturaStoragePath = storagePath;

    await paymentRef.update(updateData);

    return NextResponse.json({
      success: true,
      paymentId,
      extracted: !!file?.size,
      facturaStoragePath: storagePath,
    });
  } catch (err) {
    console.error('[payments/mark-invoiced-manual POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al marcar como facturado' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
