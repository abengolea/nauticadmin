"use server";

import { analyzePlayerPerformance } from '@/ai/flows/physical-assessment-comparative-analytics';
import type { AnalyzePlayerPerformanceInput } from '@/ai/flows/physical-assessment-comparative-analytics';
import { z } from 'zod';

const ActionInputSchema = z.object({
  playerId: z.string(),
  clubId: z.string(),
  testType: z.string(),
});

export async function getPlayerAnalysis(formData: FormData) {
  try {
    const input = ActionInputSchema.parse({
      playerId: formData.get('playerId'),
      clubId: formData.get('clubId'),
      testType: formData.get('testType'),
    });
    
    // In a real app, you would fetch real data here to enrich the prompt.
    // For this demo, we'll just pass the IDs to the simple flow.
    const result = await analyzePlayerPerformance(input);
    return { success: true, analysis: result.analysis };
  } catch (error) {
    console.error("Error getting player analysis:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: "Entrada inválida." };
    }
    return { success: false, error: "No se pudo generar el análisis debido a un error del servidor." };
  }
}
