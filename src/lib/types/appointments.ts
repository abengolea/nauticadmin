/**
 * Sistema de turnos para náuticas.
 * El administrador configura intervalos y horarios; los clientes reservan desde la app.
 */

/** Intervalos de turno permitidos (en minutos). */
export const APPOINTMENT_INTERVAL_OPTIONS = [5, 10, 15, 30, 60] as const;
export type AppointmentIntervalMinutes = (typeof APPOINTMENT_INTERVAL_OPTIONS)[number];

/** Días de la semana: 0=domingo, 1=lunes, ..., 6=sábado */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Configuración de turnos por náutica. Almacenada en schools/{schoolId}/appointmentConfig/default */
export interface AppointmentConfig {
  id: string;
  /** Si el sistema de turnos está habilitado para esta náutica */
  enabled: boolean;
  /** Intervalo entre turnos en minutos (ej: 5, 10, 15, 30) */
  slotIntervalMinutes: AppointmentIntervalMinutes;
  /** Hora de apertura en formato "HH:mm" (ej: "09:00") */
  openTime: string;
  /** Hora de cierre en formato "HH:mm" (ej: "18:00") */
  closeTime: string;
  /** Días de la semana habilitados: 0=dom, 1=lun, ..., 6=sáb */
  enabledDays: DayOfWeek[];
  /** Cuántos días hacia adelante puede reservar un cliente (ej: 7 = hasta 7 días) */
  advanceBookingDays: number;
  /** Duración de cada turno en minutos (por defecto = slotIntervalMinutes) */
  appointmentDurationMinutes?: number;
  updatedAt?: Date;
  updatedBy?: string;
}

/** Estado de un turno */
export type AppointmentStatus =
  | "scheduled"   // Reservado, pendiente
  | "completed"   // Realizado
  | "cancelled"   // Cancelado
  | "no_show";   // No se presentó

/** Turno reservado. Almacenado en schools/{schoolId}/appointments */
export interface Appointment {
  id: string;
  schoolId: string;
  /** ID del cliente (Player) que reservó */
  playerId: string;
  /** Inicio del turno */
  startTime: Date;
  /** Fin del turno */
  endTime: Date;
  status: AppointmentStatus;
  /** Notas opcionales (ej. motivo de la visita) */
  notes?: string;
  createdAt: Date;
  createdBy: string; // uid del usuario que reservó
  /** Si fue cancelado, quién y cuándo */
  cancelledAt?: Date;
  cancelledBy?: string;
}
