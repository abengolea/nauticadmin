/**
 * Tipos para el módulo de contabilidad general.
 */

export interface IncomeEntry {
  id: string;
  schoolId: string;
  date: string; // ISO date
  amount: number;
  currency: string;
  concept: string;
  category?: string;
  createdAt: string;
  createdBy: string;
}

export interface AccountingPeriod {
  year: number;
  month?: number;
}

export interface ClientAccountBalance {
  playerId: string;
  name: string;
  balance: number;
  movimientos: number;
  creditoActivo: boolean;
}

export interface VendorAccountBalance {
  vendorId: string;
  name: string;
  balance: number;
  movimientos: number;
  cuentaCorrienteHabilitada: boolean;
}

export interface AccountingSummary {
  period: AccountingPeriod;
  income: {
    total: number;
    currency: string;
    count: number;
    byCategory: {
      cuotas: number;
      inscripcion: number;
      servicios: number;
      ropa: number;
      otros: number;
    };
  };
  expenses: {
    total: number;
    count: number;
    currency: string;
  };
  result: number;
  cuentaCorriente: {
    clientes: { saldoTotal: number; movimientos: number };
    proveedores: { saldoTotal: number; movimientos: number };
  };
}
