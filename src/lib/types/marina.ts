/**
 * Tipos para el módulo náutico: amarras, contratos de amarra, y embarcaciones como entidad propia.
 * Colecciones Firestore:
 *   schools/{schoolId}/berths/{berthId}
 *   schools/{schoolId}/berthContracts/{contractId}
 *   schools/{schoolId}/vessels/{vesselId}
 */

// --- Amarras ---

export type BerthStatus = 'available' | 'occupied' | 'reserved' | 'maintenance';

export type BerthZone =
  | 'nave_cubierta'
  | 'cunas_exteriores'
  | 'en_el_agua'
  | 'kayaks'
  | 'otro';

export const BERTH_ZONE_LABELS: Record<BerthZone, string> = {
  nave_cubierta: 'Nave cubierta',
  cunas_exteriores: 'Cunas exteriores',
  en_el_agua: 'En el agua',
  kayaks: 'Kayaks / Piragüas',
  otro: 'Otro',
};

export const BERTH_STATUS_LABELS: Record<BerthStatus, string> = {
  available: 'Disponible',
  occupied: 'Ocupada',
  reserved: 'Reservada',
  maintenance: 'En mantenimiento',
};

export interface Berth {
  id: string;
  schoolId: string;
  /** Código visible: "A-12", "B-03", "N-7", etc. */
  code: string;
  description?: string;
  zone: BerthZone;
  /** Muelle o dársena al que pertenece (agrupación en el mapa) */
  dock?: string;
  /** Eslora máxima admitida (metros) */
  maxLength?: number;
  /** Manga máxima admitida (metros) */
  maxWidth?: number;
  /** Calado máximo (metros) */
  maxDraft?: number;
  status: BerthStatus;
  /** ID del socio que ocupa la amarra */
  playerId?: string | null;
  /** Nombre del socio (desnormalizado para display rápido) */
  playerName?: string | null;
  /** ID del contrato vigente */
  activeContractId?: string | null;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// --- Contratos de amarra ---

export interface BerthContract {
  id: string;
  schoolId: string;
  berthId: string;
  berthCode: string;
  playerId: string;
  playerName: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  monthlyAmount: number;
  currency: string;
  autoRenew?: boolean;
  status: 'active' | 'expired' | 'cancelled';
  notes?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
}

// --- Embarcaciones (entidad propia) ---

export type VesselType =
  | 'lancha'
  | 'velero'
  | 'catamarán'
  | 'moto_de_agua'
  | 'canobote'
  | 'kayak'
  | 'otro';

export type VesselStatus = 'active' | 'inactive' | 'maintenance';

export const VESSEL_TYPE_LABELS: Record<VesselType, string> = {
  lancha: 'Lancha',
  velero: 'Velero',
  'catamarán': 'Catamarán',
  moto_de_agua: 'Moto de agua',
  canobote: 'Canobote / Trucker',
  kayak: 'Kayak / Piragüa',
  otro: 'Otro',
};

export const VESSEL_STATUS_LABELS: Record<VesselStatus, string> = {
  active: 'Activa',
  inactive: 'Inactiva',
  maintenance: 'En mantenimiento',
};

export type VesselDocType =
  | 'seguro'
  | 'revision_prefectura'
  | 'matricula'
  | 'titulo'
  | 'otro';

export const VESSEL_DOC_TYPE_LABELS: Record<VesselDocType, string> = {
  seguro: 'Seguro',
  revision_prefectura: 'Revisión Prefectura',
  matricula: 'Matrícula',
  titulo: 'Título',
  otro: 'Otro documento',
};

export interface VesselDocument {
  id: string;
  type: VesselDocType;
  name: string;
  /** YYYY-MM-DD — si está cargado, se muestra alerta si vence en los próximos 30 días */
  expiresAt?: string;
  storagePath?: string;
  url?: string;
  uploadedAt?: Date;
  uploadedBy?: string;
}

export interface Vessel {
  id: string;
  schoolId: string;
  /** ID del socio propietario */
  playerId: string;
  /** Nombre del socio (desnormalizado) */
  playerName: string;
  nombre: string;
  matricula?: string;
  type?: VesselType;
  /** Eslora en metros */
  eslora?: number;
  /** Manga en metros */
  manga?: number;
  /** Calado en metros */
  calado?: number;
  anio?: number;
  marca?: string;
  /** Descripción del motor (ej. "2× Yamaha 115HP") */
  motor?: string;
  lona?: string;
  /** ID del ítem de pricing (canon mensual) */
  claseId?: string;
  /** Amarra asignada */
  berthId?: string | null;
  berthCode?: string | null;
  status: VesselStatus;
  documents?: VesselDocument[];
  notes?: string;
  photoUrl?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
}

// --- Bitácora ---

export interface LogbookEntry {
  id: string;
  schoolId: string;
  playerId: string;
  playerName: string;
  vesselId?: string;
  vesselName: string;
  /** Destino de la navegación */
  destino?: string;
  /** Cantidad de personas a bordo */
  tripulacion?: number;
  /** Nombres de tripulantes (opcional) */
  tripulacionNombres?: string;
  status: 'out' | 'returned';
  departureAt: Date;
  arrivalAt?: Date;
  notes?: string;
  createdAt: Date;
  createdBy: string;
}

/** Días de anticipación para alertar vencimiento de documentos */
export const VESSEL_DOC_ALERT_DAYS = 30;

/** Retorna los documentos que vencen en los próximos N días o ya vencieron */
export function getExpiringDocs(vessel: Vessel, days = VESSEL_DOC_ALERT_DAYS): VesselDocument[] {
  if (!vessel.documents?.length) return [];
  const now = new Date();
  const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return vessel.documents.filter((d) => {
    if (!d.expiresAt) return false;
    const exp = new Date(d.expiresAt);
    return exp <= threshold;
  });
}
