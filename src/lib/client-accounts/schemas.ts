import { z } from 'zod';

export const createClientAccountEntrySchema = z.object({
  schoolId: z.string().min(1),
  type: z.enum(['credit_note', 'debit_note', 'adjustment', 'monthly_fee', 'invoice']),
  date: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().min(1).max(500),
  period: z.string().optional(),
});
