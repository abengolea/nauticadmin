/**
 * Configuración de facturación electrónica por escuela (emisor fiscal = la náutica).
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { FacturaPdfEmisor } from '@/lib/factura-pdf';
import { parseTemplateFactura } from '@/lib/factura-pdf-template';
import { resolveAfipSessionForSchool, type AfipSession } from '@/lib/afip/session';

export interface SchoolFacturacion {
  razonSocial: string;
  cuit: string;
  domicilio?: string;
  condicionIVA?: string;
  telefono?: string;
  email?: string;
  ingBrutos?: string;
  inicioActividades?: string;
  operacion?: string;
  ptoVta?: number;
  cbteTipo?: number;
  afipCertPath?: string;
  afipKeyPath?: string;
  afipChainPath?: string;
  afipProduction?: boolean;
  logoStoragePath?: string;
  modeloFacturaUrl?: string;
  templateFactura?: TemplateFactura;
}

export interface SchoolWithFacturacion {
  id: string;
  name?: string;
  facturacion?: SchoolFacturacion;
}

/** Formato AFIP: 30-69388774-3 */
export function formatCuitDisplay(cuit: string): string {
  const d = cuit.replace(/\D/g, '');
  if (d.length !== 11) return cuit;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

export function parseSchoolFacturacion(raw: unknown): SchoolFacturacion | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const cuit = typeof f.cuit === 'string' ? f.cuit.trim() : '';
  const razonSocial = typeof f.razonSocial === 'string' ? f.razonSocial.trim() : '';
  if (!cuit || !razonSocial) return null;
  return {
    razonSocial,
    cuit,
    domicilio: typeof f.domicilio === 'string' ? f.domicilio : undefined,
    condicionIVA: typeof f.condicionIVA === 'string' ? f.condicionIVA : undefined,
    telefono: typeof f.telefono === 'string' ? f.telefono : undefined,
    email: typeof f.email === 'string' ? f.email : undefined,
    ingBrutos: typeof f.ingBrutos === 'string' ? f.ingBrutos : undefined,
    inicioActividades:
      typeof f.inicioActividades === 'string' ? f.inicioActividades : undefined,
    operacion: typeof f.operacion === 'string' ? f.operacion : undefined,
    ptoVta: typeof f.ptoVta === 'number' ? f.ptoVta : undefined,
    cbteTipo: typeof f.cbteTipo === 'number' ? f.cbteTipo : undefined,
    afipCertPath: typeof f.afipCertPath === 'string' ? f.afipCertPath : undefined,
    afipKeyPath: typeof f.afipKeyPath === 'string' ? f.afipKeyPath : undefined,
    afipChainPath: typeof f.afipChainPath === 'string' ? f.afipChainPath : undefined,
    afipProduction: typeof f.afipProduction === 'boolean' ? f.afipProduction : undefined,
    logoStoragePath:
      typeof f.logoStoragePath === 'string' ? f.logoStoragePath : undefined,
    modeloFacturaPath:
      typeof f.modeloFacturaPath === 'string' ? f.modeloFacturaPath : undefined,
    modeloFacturaUrl:
      typeof f.modeloFacturaUrl === 'string' ? f.modeloFacturaUrl : undefined,
    templateFactura: parseTemplateFactura(f.templateFactura) ?? undefined,
  };
}

export async function loadSchoolFacturacion(
  db: Firestore,
  schoolId: string
): Promise<SchoolFacturacion> {
  const snap = await db.collection('schools').doc(schoolId).get();
  if (!snap.exists) {
    throw new Error('Escuela no encontrada');
  }
  const facturacion = parseSchoolFacturacion(snap.data()?.facturacion);
  if (!facturacion) {
    throw new Error(
      'La escuela no tiene configuración de facturación. Completá la pestaña Facturación.'
    );
  }
  return facturacion;
}

export function facturacionToEmisor(f: SchoolFacturacion): FacturaPdfEmisor {
  return {
    razonSocial: f.razonSocial,
    cuit: formatCuitDisplay(f.cuit),
    domicilio: f.domicilio ?? '-',
    condicionIVA: f.condicionIVA ?? 'Responsable Inscripto',
  };
}

export function facturacionToAfipSession(f: SchoolFacturacion): AfipSession {
  return resolveAfipSessionForSchool(f);
}

export function getPtoVta(f: SchoolFacturacion): number {
  return f.ptoVta ?? (parseInt(process.env.AFIP_PTO_VTA ?? '1', 10) || 1);
}

export function getCbteTipo(f: SchoolFacturacion): number {
  return f.cbteTipo ?? (parseInt(process.env.AFIP_CBTE_TIPO ?? '6', 10) || 6);
}
