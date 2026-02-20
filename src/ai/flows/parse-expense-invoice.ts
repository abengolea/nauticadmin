'use server';
/**
 * Flujo Genkit para extraer datos de factura/ticket desde imagen.
 * Opción implementada: Gemini Vision + LLM con output JSON estructurado.
 *
 * Opción alternativa (no implementada): Google Document AI para OCR + parser.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'zod';
import {
  getAvailableGeminiModel,
  hasGeminiApiKey,
} from '@/ai/get-available-gemini-model';
import {
  aiExtractedExpenseSchema,
  type AIExtractedExpense,
} from '@/lib/expenses/schemas';
import {
  normalizeNumber,
  normalizeDate,
  normalizeAndValidateCuit,
} from '@/lib/expenses/normalize';

const RawAIOutputSchema = z.object({
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
    currency: z.enum(['ARS', 'USD']).optional(),
    net: z.union([z.number(), z.string()]).optional(),
    iva: z.union([z.number(), z.string()]).optional(),
    total: z.union([z.number(), z.string()]),
    breakdown: z
      .object({
        alicuotas: z
          .array(
            z.object({
              base: z.union([z.number(), z.string()]),
              rate: z.union([z.number(), z.string()]),
              amount: z.union([z.number(), z.string()]),
            })
          )
          .optional(),
        percepciones: z
          .array(
            z.object({
              base: z.union([z.number(), z.string()]),
              rate: z.union([z.number(), z.string()]),
              amount: z.union([z.number(), z.string()]),
            })
          )
          .optional(),
      })
      .optional(),
  }),
  items: z
    .array(
      z.object({
        description: z.string(),
        qty: z.union([z.number(), z.string()]).optional(),
        unitPrice: z.union([z.number(), z.string()]).optional(),
        subtotal: z.union([z.number(), z.string()]).optional(),
      })
    )
    .optional(),
});

function normalizeAIOutput(raw: z.infer<typeof RawAIOutputSchema>): AIExtractedExpense {
  const net = normalizeNumber(raw.amounts.net);
  const iva = normalizeNumber(raw.amounts.iva);
  const total =
    normalizeNumber(raw.amounts.total) ??
    (typeof raw.amounts.total === 'number' ? raw.amounts.total : 0);

  const alicuotas = raw.amounts.breakdown?.alicuotas?.map((a) => ({
    base: normalizeNumber(a.base) ?? 0,
    rate: normalizeNumber(a.rate) ?? 0,
    amount: normalizeNumber(a.amount) ?? 0,
  }));

  const percepciones = raw.amounts.breakdown?.percepciones?.map((p) => ({
    base: normalizeNumber(p.base) ?? 0,
    rate: normalizeNumber(p.rate) ?? 0,
    amount: normalizeNumber(p.amount) ?? 0,
  }));

  const cuitResult = raw.supplier?.cuit
    ? normalizeAndValidateCuit(raw.supplier.cuit)
    : undefined;

  return {
    supplier: {
      name: raw.supplier?.name?.trim() || undefined,
      cuit: cuitResult?.raw ?? raw.supplier?.cuit?.trim(),
      ivaCondition: raw.supplier?.ivaCondition?.trim(),
    },
    invoice: {
      type: raw.invoice?.type?.trim(),
      letter: raw.invoice?.letter?.trim(),
      pos: raw.invoice?.pos?.trim(),
      number: raw.invoice?.number?.trim(),
      issueDate: normalizeDate(raw.invoice?.issueDate ?? '') ?? raw.invoice?.issueDate?.trim(),
      cae: raw.invoice?.cae?.trim(),
      caeDue: normalizeDate(raw.invoice?.caeDue ?? '') ?? raw.invoice?.caeDue?.trim(),
    },
    amounts: {
      currency: raw.amounts.currency === 'USD' ? 'USD' : 'ARS',
      net: net as number | undefined,
      iva: iva as number | undefined,
      total,
      breakdown:
        alicuotas || percepciones
          ? { alicuotas, percepciones }
          : undefined,
    },
    items: raw.items?.map((i) => ({
      description: i.description,
      qty: normalizeNumber(i.qty) ?? i.qty,
      unitPrice: normalizeNumber(i.unitPrice) ?? i.unitPrice,
      subtotal: normalizeNumber(i.subtotal) ?? i.subtotal,
    })),
  };
}

export interface ParseExpenseResult {
  extracted: AIExtractedExpense;
  confidence: number;
  rawText?: string;
  model: string;
}

/**
 * Parsea una imagen de factura/ticket y devuelve datos estructurados.
 * @param imageBase64 - Imagen en base64 (data URL o raw)
 * @param mimeType - image/jpeg, image/png, etc.
 */
export async function parseExpenseFromImage(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<ParseExpenseResult> {
  if (!hasGeminiApiKey()) {
    throw new Error(
      'Falta GEMINI_API_KEY en .env.local. Agregá la variable y reiniciá el servidor.'
    );
  }

  const modelName = await getAvailableGeminiModel();
  if (!modelName) {
    throw new Error('No se pudo obtener un modelo Gemini. Verificá la API key.');
  }

  // Quitar prefijo data URL si existe
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const promptText = `
Eres un asistente que extrae datos de facturas y tickets de compra (Argentina).

Analizá la imagen y devolvé un JSON con esta estructura exacta (sin markdown, solo JSON):

{
  "supplier": {
    "name": "Razón social o nombre del emisor",
    "cuit": "CUIT con formato XX-XXXXXXXX-X",
    "ivaCondition": "Condición IVA si aparece (ej: IVA Responsable Inscripto)"
  },
  "invoice": {
    "type": "A, B, C, etc.",
    "letter": "A, B, C si aplica",
    "pos": "Punto de venta (número)",
    "number": "Número de factura",
    "issueDate": "dd/mm/yyyy",
    "cae": "CAE si es factura electrónica",
    "caeDue": "Vencimiento CAE si aparece"
  },
  "amounts": {
    "currency": "ARS o USD",
    "net": número neto (sin IVA),
    "iva": monto IVA,
    "total": número total a pagar,
    "breakdown": {
      "alicuotas": [{"base": n, "rate": n, "amount": n}],
      "percepciones": [{"base": n, "rate": n, "amount": n}]
    }
  },
  "items": [
    {"description": "descripción", "qty": n, "unitPrice": n, "subtotal": n}
  ]
}

Reglas:
- Si es ticket sin IVA, net y iva pueden omitirse; total es obligatorio.
- Fechas en dd/mm/yyyy.
- Números como número (no string), sin puntos de miles.
- Si no encontrás un dato, omitilo (no pongas null).
- items es opcional; si la factura no tiene ítems detallados, omitilo.
- breakdown es opcional.
`;

  const response = await ai.generate({
    model: googleAI.model(modelName),
    prompt: [
      { text: promptText },
      {
        media: {
          contentType: mimeType,
          url: `data:${mimeType};base64,${base64Data}`,
        },
      },
    ],
    config: {
      temperature: 0.1,
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('La IA no devolvió texto. La imagen puede estar borrosa o vacía.');
  }

  // Extraer JSON del texto (puede venir envuelto en ```json)
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1]!.trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('La IA devolvió un JSON inválido.');
  }

  const rawResult = RawAIOutputSchema.safeParse(parsed);
  if (!rawResult.success) {
    throw new Error(
      `Datos extraídos inválidos: ${rawResult.error.message}. Revisá la factura.`
    );
  }

  const extracted = normalizeAIOutput(rawResult.data);
  const validated = aiExtractedExpenseSchema.safeParse(extracted);
  if (!validated.success) {
    throw new Error(`Validación fallida: ${validated.error.message}`);
  }

  return {
    extracted: validated.data,
    confidence: 0.85,
    rawText: text.slice(0, 2000),
    model: modelName,
  };
}
