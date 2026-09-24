'use server';
/**
 * Analiza columnas de un extracto de pagos (crédito/débito) y sugiere el mapeo.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'genkit';
import {
  getAvailableGeminiModel,
  hasGeminiApiKey,
  getGeminiApiKeyMissingMessage,
} from '@/ai/get-available-gemini-model';
import type { AiColumnMappingResult } from '@/lib/reconciliacion-excel/column-mapping';

const ExtraFieldSchema = z.object({
  label: z.string(),
  column: z.string(),
});

const AnalyzeReconciliationOutputSchema = z.object({
  payer: z.string().optional(),
  amount: z.string().optional(),
  date: z.string().optional(),
  reference: z.string().optional(),
  extras: z.array(ExtraFieldSchema).optional(),
  suggestedKind: z.enum(['credit', 'debit']).optional(),
  suggestedProfileName: z.string().optional(),
  notes: z.string().optional(),
});

const AnalyzeReconciliationInputSchema = z.object({
  headers: z.array(z.string()),
  sampleRows: z.array(z.array(z.string())),
  fileName: z.string().optional(),
});

export async function analyzeReconciliationExcelWithAI(
  headers: string[],
  sampleRows: string[][],
  fileName?: string
): Promise<AiColumnMappingResult> {
  return analyzeReconciliationExcelFlow({ headers, sampleRows, fileName });
}

const analyzeReconciliationPrompt = ai.definePrompt({
  name: 'analyzeReconciliationExcelPrompt',
  input: { schema: AnalyzeReconciliationInputSchema },
  output: { schema: AnalyzeReconciliationOutputSchema },
  prompt: `
Eres un asistente de conciliación de pagos de una náutica (NauticAdmin). Analizás extractos bancarios o de tarjeta (crédito o débito) en Excel/CSV y generás el mapeo de columnas.

**Campos principales:**
- payer: quién pagó (pagador, titular, nombre, cuenta, cliente)
- amount: importe o monto del movimiento
- date: fecha de la operación (opcional)
- reference: referencia, comprobante, autorización u observación útil para desempatar (opcional)

**Campos extra:**
Generá un extra por cada columna útil que no sea payer/amount/date/reference (comercio, CBU, nro de tarjeta, cupón, lote, etc.).
label: nombre corto en español. column: el encabezado EXACTO del archivo.
No inventes columnas que no estén en los encabezados.
No incluyas columnas vacías o sin sentido.

**Encabezados:**
{{headers}}

**Primeras filas de ejemplo:**
{{sampleRows}}

**Nombre del archivo (pista):**
{{fileName}}

**Instrucciones:**
1. payer y amount son obligatorios si hay alguna columna razonable.
2. Usá el texto EXACTO del encabezado en payer, amount, date, reference y extras.column.
3. suggestedKind: "credit" si parece extracto de crédito/tarjeta; "debit" si parece débito o cuenta bancaria.
4. suggestedProfileName: nombre corto para guardar el mapeo (ej. "Visa Crédito", "Visa Débito", "Galicia").
5. notes: una o dos frases en español sobre lo que detectaste.
6. Respondé únicamente en español y en el JSON del schema.
  `,
});

const analyzeReconciliationExcelFlow = ai.defineFlow(
  {
    name: 'analyzeReconciliationExcelFlow',
    inputSchema: AnalyzeReconciliationInputSchema,
    outputSchema: AnalyzeReconciliationOutputSchema,
  },
  async (input) => {
    if (!hasGeminiApiKey()) {
      throw new Error(getGeminiApiKeyMissingMessage());
    }
    const modelName = await getAvailableGeminiModel();
    if (!modelName) {
      throw new Error(
        'No se pudo obtener un modelo Gemini. Verificá que la API key sea válida en https://aistudio.google.com/apikey'
      );
    }
    const { output } = await analyzeReconciliationPrompt(
      {
        ...input,
        fileName: input.fileName || '(sin nombre)',
      },
      { model: googleAI.model(modelName) }
    );
    if (!output) {
      throw new Error('La IA no generó un mapeo válido.');
    }
    return {
      payer: output.payer,
      amount: output.amount,
      date: output.date,
      reference: output.reference,
      extras: output.extras ?? [],
      suggestedKind: output.suggestedKind,
      suggestedProfileName: output.suggestedProfileName,
      notes: output.notes,
    };
  }
);
