/**
 * GET /api/reports/iva?schoolId=...&month=...&year=...
 * Devuelve IVA ventas (pagos facturados) e IVA compras (gastos confirmados/pagados)
 * para exportar en TXT o Excel.
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/auth-server';
import { isSchoolAdminOrSuperAdmin } from '@/lib/auth-server';
import { COLLECTIONS } from '@/lib/payments/constants';

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  const t = val as { toDate?: () => Date; toMillis?: () => number };
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof t?.toMillis === 'function') return new Date(t.toMillis());
  if (typeof val === 'string') return new Date(val);
  return new Date();
}

export interface IvaVentaRow {
  fecha: string;
  tipoCbte: string;
  ptoVta: string;
  numero: string;
  cuitDni: string;
  nombre: string;
  neto: number;
  iva: number;
  total: number;
}

export interface IvaCompraRow {
  fecha: string;
  tipoCbte: string;
  ptoVta: string;
  numero: string;
  cuit: string;
  razonSocial: string;
  neto: number;
  iva: number;
  total: number;
}

export async function GET(request: Request) {
  try {
    const auth = await verifyIdToken(request.headers.get('Authorization'));
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId')?.trim();
    const month = searchParams.get('month')?.trim();
    const year = searchParams.get('year')?.trim();

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId es requerido' }, { status: 400 });
    }

    const canAccess = await isSchoolAdminOrSuperAdmin(auth.uid, schoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Sin permisos para esta escuela' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const ptoVta = process.env.AFIP_PTO_VTA ?? '1';

    // Obtener jugadores para nombres/CUIT
    const playersSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('players')
      .get();

    const playerMap = new Map<string, { name: string; cuit?: string; dni?: string }>();
    playersSnap.docs.forEach((doc) => {
      const d = doc.data();
      const name = `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || 'Cliente';
      playerMap.set(doc.id, {
        name: name || 'Cliente',
        cuit: d.cuit,
        dni: d.dni,
      });
    });

    // --- IVA VENTAS: pagos facturados ---
    const paymentsSnap = await db
      .collection(COLLECTIONS.payments)
      .where('schoolId', '==', schoolId)
      .where('status', '==', 'approved')
      .get();

    const ivaVentas: IvaVentaRow[] = [];

    paymentsSnap.docs.forEach((doc) => {
      const d = doc.data();
      if (d.facturado !== true) return;

      const fecha = toDate(d.facturadoAt ?? d.createdAt);
      const monthNum = fecha.getMonth() + 1;
      const yearNum = fecha.getFullYear();

      if (month && String(monthNum).padStart(2, '0') !== String(month).padStart(2, '0')) return;
      if (year && String(yearNum) !== year) return;

      const amount = Number(d.amount) ?? 0;
      const impNeto = Math.round((amount / 1.21) * 100) / 100;
      const impIva = Math.round((amount - impNeto) * 100) / 100;

      const player = playerMap.get(d.playerId);
      const docReceptor = player?.cuit ?? (player?.dni ? `20-${String(player.dni).replace(/\D/g, '').padStart(8, '0')}-0` : '-');
      const nombre = player?.name ?? 'Cliente';

      ivaVentas.push({
        fecha: fecha.toISOString().slice(0, 10),
        tipoCbte: 'Factura B',
        ptoVta,
        numero: doc.id.slice(-8),
        cuitDni: docReceptor,
        nombre,
        neto: impNeto,
        iva: impIva,
        total: amount,
      });
    });

    ivaVentas.sort((a, b) => a.fecha.localeCompare(b.fecha));

    // --- IVA COMPRAS: gastos confirmados/pagados ---
    const expensesSnap = await db
      .collection('schools')
      .doc(schoolId)
      .collection('expenses')
      .where('status', 'in', ['confirmed', 'paid'])
      .get();

    const ivaCompras: IvaCompraRow[] = [];

    expensesSnap.docs.forEach((doc) => {
      const d = doc.data();
      if (d.archivedAt) return;

      const issueDate = d.invoice?.issueDate;
      if (!issueDate) return;

      const [y, m] = issueDate.split('-');
      if (month && m !== String(month).padStart(2, '0')) return;
      if (year && y !== year) return;

      const amounts = d.amounts ?? {};
      const impNeto = Number(amounts.net) ?? 0;
      const impIva = Number(amounts.iva) ?? 0;
      const impTotal = Number(amounts.total) ?? 0;

      ivaCompras.push({
        fecha: issueDate,
        tipoCbte: d.invoice?.type ?? 'Factura',
        ptoVta: String(d.invoice?.pos ?? '-'),
        numero: String(d.invoice?.number ?? '-'),
        cuit: (d.supplier?.cuit ?? '').replace(/\D/g, '') || '-',
        razonSocial: d.supplier?.name ?? '-',
        neto: impNeto,
        iva: impIva,
        total: impTotal,
      });
    });

    ivaCompras.sort((a, b) => a.fecha.localeCompare(b.fecha));

    return NextResponse.json({
      ivaVentas,
      ivaCompras,
      periodo: { month: month ?? 'todos', year: year ?? 'todos' },
    });
  } catch (err) {
    console.error('[reports/iva GET]', err);
    return NextResponse.json({ error: 'Error al obtener reporte IVA' }, { status: 500 });
  }
}
