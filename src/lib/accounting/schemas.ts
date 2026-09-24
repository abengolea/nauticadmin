import { z } from 'zod';

export const createIncomeEntrySchema = z.object({
  schoolId: z.string().min(1),
  date: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(1).default('ARS'),
  concept: z.string().min(1).max(300),
  category: z.string().max(100).optional(),
});
