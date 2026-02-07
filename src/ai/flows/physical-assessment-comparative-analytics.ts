'use server';
/**
 * @fileOverview Herramienta de IA generativa para proporcionar análisis comparativos sobre los datos de tendencia de un jugador en pruebas físicas a lo largo del tiempo,
 * medidos contra las medianas del club, para identificar rápidamente áreas de mejora y adaptar los planes de entrenamiento de manera efectiva.
 *
 * - analyzePlayerPerformance - Una función que analiza los datos de evaluación física de un jugador en comparación con las medianas del club.
 * - AnalyzePlayerPerformanceInput - El tipo de entrada para la función analyzePlayerPerformance.
 * - AnalyzePlayerPerformanceOutput - El tipo de retorno para la función analyzePlayerPerformance.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzePlayerPerformanceInputSchema = z.object({
  playerId: z.string().describe('El ID del jugador a analizar.'),
  clubId: z.string().describe('El ID del club al que pertenece el jugador.'),
  testType: z.string().describe('El tipo de prueba física a analizar (por ejemplo, sprint_10m, salto_vertical).'),
});
export type AnalyzePlayerPerformanceInput = z.infer<typeof AnalyzePlayerPerformanceInputSchema>;

const AnalyzePlayerPerformanceOutputSchema = z.object({
  analysis: z.string().describe('Un análisis detallado de las tendencias de rendimiento del jugador en comparación con las medianas del club, destacando áreas de mejora.'),
});
export type AnalyzePlayerPerformanceOutput = z.infer<typeof AnalyzePlayerPerformanceOutputSchema>;

export async function analyzePlayerPerformance(input: AnalyzePlayerPerformanceInput): Promise<AnalyzePlayerPerformanceOutput> {
  return analyzePlayerPerformanceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzePlayerPerformancePrompt',
  input: {schema: AnalyzePlayerPerformanceInputSchema},
  output: {schema: AnalyzePlayerPerformanceOutputSchema},
  prompt: `Eres un experto analista de rendimiento deportivo.

Se te proporcionan los datos de rendimiento de un jugador dentro de su club para un tipo de prueba específico.
Analiza la tendencia de rendimiento del jugador a lo largo del tiempo en comparación con el rendimiento medio del club en la misma prueba.
Identifica las fortalezas y debilidades del jugador y sugiere áreas de mejora.

ID del Jugador: {{{playerId}}}
ID del Club: {{{clubId}}}
Tipo de Prueba: {{{testType}}}

Proporciona un análisis conciso que los entrenadores puedan utilizar para adaptar los planes de entrenamiento de manera efectiva.
`,
});

const analyzePlayerPerformanceFlow = ai.defineFlow(
  {
    name: 'analyzePlayerPerformanceFlow',
    inputSchema: AnalyzePlayerPerformanceInputSchema,
    outputSchema: AnalyzePlayerPerformanceOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
