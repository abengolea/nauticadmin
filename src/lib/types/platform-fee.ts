/**
 * Tipos para el módulo de mensualidades de náuticas a la plataforma.
 * Las escuelas pagan una cuota mensual a NauticAdmin; el super admin define tarifas y mora.
 */

export type SchoolFeePaymentStatus = 'pending' | 'approved' | 'rejected' | 'refunded';

/** Configuración global de mensualidades (super admin). Almacenada en platformConfig/platformFeeConfig */
export interface PlatformFeeConfig {
  /** Día del mes de vencimiento (1-31). Default 10. */
  dueDayOfMonth: number;
  /** Días de mora para enviar aviso a la náutica. Default 5. */
  delinquencyDaysWarning?: number;
  /** Días de mora para suspender la náutica. Default 30. */
  delinquencyDaysSuspension?: number;
  /** Porcentaje adicional por mora (ej. 5 = 5%). Default 5. */
  lateFeePercent?: number;
  /** Moneda. Default ARS. */
  currency?: string;
  /** Tarifa mensual por defecto (si la náutica no tiene tarifa específica). Default 0. */
  defaultMonthlyAmount?: number;
  updatedAt: Date;
  updatedBy: string;
}

/** Configuración de mensualidad por náutica. Almacenada en schools/{schoolId}/schoolFeeConfig/default */
export interface SchoolFeeConfig {
  /** Tarifa mensual en la moneda configurada. 0 = sin cargo (bonificada). */
  monthlyAmount: number;
  /** Si true, la náutica está bonificada (no paga). Ej: San Nicolás. */
  isBonified: boolean;
  /** Moneda (override opcional). */
  currency?: string;
  updatedAt: Date;
  updatedBy: string;
}

/** Pago de mensualidad de náutica a plataforma. Colección schoolFeePayments */
export interface SchoolFeePayment {
  id: string;
  schoolId: string;
  period: string; // YYYY-MM
  amount: number;
  /** Monto adicional por mora aplicado. */
  lateFeeAmount?: number;
  currency: string;
  provider: 'mercadopago' | 'manual';
  providerPaymentId?: string;
  status: SchoolFeePaymentStatus;
  paidAt?: Date;
  createdAt: Date;
  /** UID de quien registró pago manual (si aplica). */
  manualRecordedBy?: string;
}

/** Escuela en mora (para panel super admin). */
export interface SchoolFeeDelinquent {
  schoolId: string;
  schoolName: string;
  city: string;
  province: string;
  period: string;
  dueDate: Date;
  daysOverdue: number;
  baseAmount: number;
  lateFeeAmount: number;
  totalAmount: number;
  currency: string;
  isBonified: boolean;
  /** Si la náutica ya fue suspendida por mora. */
  isSuspended: boolean;
  /** Link de pago (si hay token de plataforma). */
  paymentUrl?: string;
}
