/**
 * Schemas Zod para validación del módulo de Gastos.
 */

import { z } from 'zod';

export const expenseStatusSchema = z.enum([
  'draft',
  'confirmed',
  'paid',
  'cancelled',
]);

export const vendorAccountEntryTypeSchema = z.enum([
  'invoice',
  'payment',
  'credit_note',
  'debit_note',
  'adjustment',
]);

export const currencySchema = z.enum(['ARS', 'USD']);

export const expenseSourceSchema = z.object({
  storagePath: z.string().min(1),
  downloadUrl: z.string().url().optional(),
  thumbnailPath: z.string().optional(),
});

export const expenseSupplierSchema = z.object({
  vendorId: z.string().optional(),
  name: z.string().optional(),
  cuit: z.string().optional(),
  ivaCondition: z.string().optional(),
});

export const expenseInvoiceSchema = z.object({
  type: z.string().optional(),
  letter: z.string().optional(),
  pos: z.string().optional(),
  number: z.string().optional(),
  issueDate: z.string().optional(),
  cae: z.string().optional(),
  caeDue: z.string().optional(),
});

export const expenseAmountsSchema = z.object({
  currency: currencySchema,
  net: z.number().optional(),
  iva: z.number().optional(),
  total: z.number(),
  breakdown: z
    .object({
      alicuotas: z
        .array(
          z.object({
            base: z.number(),
            rate: z.number(),
            amount: z.number(),
          })
        )
        .optional(),
      percepciones: z
        .array(
          z.object({
            base: z.number(),
            rate: z.number(),
            amount: z.number(),
          })
        )
        .optional(),
    })
    .optional(),
});

export const expenseItemSchema = z.object({
  description: z.string(),
  qty: z.number().optional(),
  unitPrice: z.number().optional(),
  subtotal: z.number().optional(),
});

export const expenseAISchema = z.object({
  provider: z.string(),
  model: z.string(),
  confidence: z.number().min(0).max(1),
  rawText: z.string().optional(),
  extractedAt: z.string(),
});

export const expenseValidationsSchema = z.object({
  totalMatches: z.boolean().optional(),
  ivaMatches: z.boolean().optional(),
  cuitValid: z.boolean().optional(),
  duplicateCandidate: z.boolean().optional(),
});

export const expenseLinksSchema = z.object({
  paymentIds: z.array(z.string()).optional(),
});

export const expenseSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  source: expenseSourceSchema,
  status: expenseStatusSchema,
  supplier: expenseSupplierSchema,
  invoice: expenseInvoiceSchema,
  amounts: expenseAmountsSchema,
  items: z.array(expenseItemSchema).optional(),
  categoryId: z.string().optional(),
  notes: z.string().optional(),
  ai: expenseAISchema.optional(),
  validations: expenseValidationsSchema.optional(),
  links: expenseLinksSchema.optional(),
});

/** Schema para la respuesta JSON de la IA (parse-expense) */
export const aiExtractedExpenseSchema = z.object({
  concept: z.string().optional(),
  supplier: z.object({
    name: z.string().optional(),
    cuit: z.string().optional(),
    ivaCondition: z.string().optional(),
  }),
  invoice: z.object({
    type: z.string().optional(),
    letter: z.string().optional(),
    pos: z.string().optional(),
    number: z.string().optional(),
    issueDate: z.string().optional(),
    cae: z.string().optional(),
    caeDue: z.string().optional(),
  }),
  amounts: z.object({
    currency: currencySchema.default('ARS'),
    net: z.number().optional(),
    iva: z.number().optional(),
    total: z.number(),
    breakdown: z
      .object({
        alicuotas: z
          .array(
            z.object({
              base: z.number(),
              rate: z.number(),
              amount: z.number(),
            })
          )
          .optional(),
        percepciones: z
          .array(
            z.object({
              base: z.number(),
              rate: z.number(),
              amount: z.number(),
            })
          )
          .optional(),
      })
      .optional(),
  }),
  items: z.array(expenseItemSchema).optional(),
});

export type AIExtractedExpense = z.infer<typeof aiExtractedExpenseSchema>;

/** Request para parse-expense */
export const parseExpenseRequestSchema = z.object({
  expenseId: z.string().min(1),
  schoolId: z.string().min(1),
  storagePath: z.string().min(1),
});

/** Request para crear expense draft (upload) */
export const createExpenseDraftSchema = z.object({
  schoolId: z.string().min(1),
  storagePath: z.string().min(1),
  thumbnailPath: z.string().optional(),
});

/** Request para confirmar/actualizar expense */
export const confirmExpenseSchema = z.object({
  expenseId: z.string().min(1),
  schoolId: z.string().min(1),
  updates: z
    .object({
      supplier: expenseSupplierSchema.optional(),
      invoice: expenseInvoiceSchema.optional(),
      amounts: expenseAmountsSchema.optional(),
      items: z.array(expenseItemSchema).optional(),
      categoryId: z.string().optional(),
      notes: z.string().optional(),
      status: expenseStatusSchema.optional(),
      archivedAt: z.string().optional().nullable(),
    })
    .optional(),
});

/** Request para actualizar proveedor (PATCH vendor) */
export const updateVendorSchema = z.object({
  schoolId: z.string().min(1),
  name: z.string().optional(),
  cuit: z.string().optional(),
  ivaCondition: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  cuentaCorrienteHabilitada: z.boolean().optional(),
  defaultCategoryId: z.string().optional(),
  notes: z.string().optional(),
});

/** Request para registrar pago */
export const registerPaymentSchema = z.object({
  schoolId: z.string().min(1),
  vendorId: z.string().min(1),
  amount: z.number().positive(),
  currency: currencySchema,
  date: z.string(),
  method: z.string().optional(),
  reference: z.string().optional(),
  receiptType: z.enum(['cheque', 'transfer', 'credit_card']).optional(),
  receiptStoragePath: z.string().optional(),
  receiptDetails: z.record(z.union([z.string(), z.number()])).optional(),
  appliedTo: z
    .array(
      z.object({
        expenseId: z.string(),
        amount: z.number().positive(),
      })
    )
    .optional()
    .default([]),
});
