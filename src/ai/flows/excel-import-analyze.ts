'use server';
/**
 * Flujo de Genkit para analizar columnas de un Excel de clientes náuticos
 * y determinar el mapeo a campos del sistema (propietario, embarcación, matrícula, etc.).
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'genkit';
import {
  getAvailableGeminiModel,
  hasGeminiApiKey,
  getGeminiApiKeyMissingMessage,
} from '@/ai/get-available-gemini-model';
import type { ExcelFieldKey } from '@/lib/excel-import-types';

const ColumnMappingSchema = z.object({
  /** Índice de columna (0-based) */
  columnIndex: z.number(),
  /** Nombre de columna en el Excel */
  columnHeader: z.string(),
  /** Campo del sistema al que mapear */
  systemField: z.enum([
    'apellidoNombres',
    'email',
    'telefono',
    'datosEmbarcacion',
    'nombreEmbarcacion',
    'matricula',
    'creditoActivo',
    'ubicacion',
    'clienteDesde',
    'medidas',
    'observaciones',
    'personasAutorizadas',
  ]),
  /** Confianza del mapeo (0-1) */
  confidence: z.number().min(0).max(1),
});

const AnalyzeExcelOutputSchema = z.object({
  mappings: z.array(ColumnMappingSchema),
  /** Si hay filas que parecen encabezados o datos de ejemplo */
  suggestedFirstDataRow: z.number().min(0),
  /** Advertencias o notas sobre el archivo */
  notes: z.string().optional(),
});

export type AnalyzeExcelOutput = {
  mappings: Array<{
    columnIndex: number;
    columnHeader: string;
    systemField: ExcelFieldKey;
    confidence: number;
  }>;
  suggestedFirstDataRow: number;
  notes?: string;
};

const AnalyzeExcelInputSchema = z.object({
  headers: z.array(z.string()).describe('Encabezados de las columnas del Excel'),
  sampleRows: z.array(z.array(z.string())).describe('Primeras 5 filas de datos como ejemplo'),
});

export async function analyzeExcelColumnsWithAI(
  headers: string[],
  sampleRows: string[][]
): Promise<AnalyzeExcelOutput> {
  return analyzeExcelFlow({ headers, sampleRows });
}

const analyzeExcelPrompt = ai.definePrompt({
  name: 'analyzeExcelPrompt',
  input: { schema: AnalyzeExcelInputSchema },
  output: { schema: AnalyzeExcelOutputSchema },
  prompt: `
Eres un asistente de una plataforma de administración de náuticas (NauticAdmin). Tu tarea es analizar un archivo Excel con datos de clientes y embarcaciones, y determinar el mapeo a los campos del sistema.

**Campos del sistema que necesitamos:**
- apellidoNombres: Apellido Nombres (persona) o Razón Social (empresa) - propietario del cliente
- email: Email o correo electrónico del cliente
- telefono: Teléfono de contacto
- datosEmbarcacion: Datos generales de la embarcación
- nombreEmbarcacion: Nombre de la embarcación
- matricula: Matrícula de la embarcación
- creditoActivo: Si tiene crédito activo (Sí/No, true/false, etc.)
- ubicacion: Ubicación (amarra, muelle, etc.)
- clienteDesde: Fecha desde que es cliente
- medidas: Medidas de la embarcación
- observaciones: Observaciones adicionales o demás datos
- personasAutorizadas: Personas autorizadas a manejar la embarcación (pueden estar separadas por coma o en varias columnas)

**Encabezados del Excel:**
{{headers}}

**Primeras filas de datos (ejemplo):**
{{sampleRows}}

**Instrucciones:**
1. Analiza cada columna del Excel y mapeala al campo del sistema más apropiado.
2. Si una columna no coincide con ningún campo, usa "observaciones" para datos genéricos.
3. No incluyas columnas vacías o que no tengan sentido.
4. suggestedFirstDataRow: indica si la fila 0 es encabezado (0) o si los datos empiezan en otra fila.
5. confidence: 0.9-1 si hay coincidencia clara, 0.5-0.8 si es inferencia, 0.3-0.5 si es dudoso.
6. Responde únicamente en español.
7. Devuelve el JSON con mappings, suggestedFirstDataRow y notes opcional.
  `,
});

const analyzeExcelFlow = ai.defineFlow(
  {
    name: 'analyzeExcelFlow',
    inputSchema: AnalyzeExcelInputSchema,
    outputSchema: AnalyzeExcelOutputSchema,
  },
  async (input) => {
    if (!hasGeminiApiKey()) {
      throw new Error(
        getGeminiApiKeyMissingMessage()
      );
    }
    const modelName = await getAvailableGeminiModel();
    if (!modelName) {
      throw new Error(
        'No se pudo obtener un modelo Gemini. Verificá que la API key sea válida en https://aistudio.google.com/apikey'
      );
    }
    const { output } = await analyzeExcelPrompt(input, {
      model: googleAI.model(modelName),
    });
    if (!output?.mappings) {
      throw new Error('La IA no generó un mapeo válido.');
    }
    return {
      mappings: output.mappings,
      suggestedFirstDataRow: output.suggestedFirstDataRow ?? 0,
      notes: output.notes,
    };
  }
);
