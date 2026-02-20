/**
 * Tipos para el módulo de Gastos.
 * Usamos schoolId como tenant (equivalente a companyId en el diseño).
 */

export type ExpenseStatus = 'draft' | 'confirmed' | 'paid' | 'cancelled';

export type VendorAccountEntryType =
  | 'invoice'
  | 'payment'
  | 'credit_note'
  | 'debit_note'
  | 'adjustment';

export type Currency = 'ARS' | 'USD';

export type IvaCondition =
  | 'IVA Responsable Inscripto'
  | 'IVA Responsable no Inscripto'
  | 'IVA Exento'
  | 'Consumidor Final'
  | 'Monotributista'
  | string;

export interface ExpenseSource {
  storagePath: string;
  downloadUrl?: string;
  thumbnailPath?: string;
}

export interface ExpenseSupplier {
  vendorId?: string;
  name?: string;
  cuit?: string;
  ivaCondition?: IvaCondition;
}

export interface ExpenseInvoice {
  type?: string; // A, B, C, etc.
  letter?: string;
  pos?: string;
  number?: string;
  issueDate?: string; // ISO
  cae?: string;
  caeDue?: string; // ISO
}

export interface ExpenseAmounts {
  currency: Currency;
  net?: number;
  iva?: number;
  total: number;
  breakdown?: {
    alicuotas?: Array<{ base: number; rate: number; amount: number }>;
    percepciones?: Array<{ base: number; rate: number; amount: number }>;
  };
}

export interface ExpenseItem {
  description: string;
  qty?: number;
  unitPrice?: number;
  subtotal?: number;
}

export interface ExpenseAI {
  provider: string;
  model: string;
  confidence: number;
  rawText?: string;
  extractedAt: string; // ISO
}

export interface ExpenseValidations {
  totalMatches?: boolean;
  ivaMatches?: boolean;
  cuitValid?: boolean;
  duplicateCandidate?: boolean;
}

export interface ExpenseLinks {
  paymentIds?: string[];
}

export interface Expense {
  id: string;
  schoolId: string;
  createdBy: string;
  createdAt: string; // ISO
  updatedAt?: string; // ISO
  source: ExpenseSource;
  status: ExpenseStatus;
  supplier: ExpenseSupplier;
  invoice: ExpenseInvoice;
  amounts: ExpenseAmounts;
  items?: ExpenseItem[];
  categoryId?: string;
  notes?: string;
  ai?: ExpenseAI;
  validations?: ExpenseValidations;
  links?: ExpenseLinks;
}

export interface ExpenseVendor {
  id: string;
  schoolId: string;
  name: string;
  cuit?: string;
  defaultCategoryId?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VendorAccountEntry {
  id: string;
  vendorId: string;
  schoolId: string;
  date: string; // ISO
  type: VendorAccountEntryType;
  ref: {
    expenseId?: string;
    paymentId?: string;
  };
  debit: number;
  credit: number;
  balanceAfter?: number;
  description: string;
  createdAt?: string;
}

export interface ExpensePayment {
  id: string;
  schoolId: string;
  vendorId: string;
  amount: number;
  currency: Currency;
  date: string; // ISO
  method?: string;
  reference?: string;
  appliedTo: Array<{ expenseId: string; amount: number }>;
  createdAt: string;
  createdBy: string;
}
