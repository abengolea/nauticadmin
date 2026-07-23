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
  getGeminiApiKeyMissingMessage,
} from '@/ai/get-available-gemini-model';
import {
  aiExtractedExpenseSchema,
  type AIExtractedExpense,
} from '@/lib/expenses/schemas';
import {
  normalizeNumber,
  normalizeDate,
  normalizeAndValidateCuit,
  normalizeCuit,
} from '@/lib/expenses/normalize';

/** Gemini a menudo devuelve null en campos opcionales; .optional() solo admite undefined. */
const numOrStr = z.union([z.number(), z.string()]).nullish();
const str = z.string().nullish();

const RawAIOutputSchema = z.object({
  concept: str,
  supplier: z
    .object({
      name: str,
      cuit: str,
      ivaCondition: str,
    })
    .nullish(),
  /** Receptor/cliente (quien compra). Solo para desambiguar; no es el proveedor. */
  buyer: z
    .object({
      name: str,
      cuit: str,
    })
    .nullish(),
  invoice: z
    .object({
      type: str,
      letter: str,
      pos: numOrStr,
      number: numOrStr,
      issueDate: str,
      cae: str,
      caeDue: str,
    })
    .nullish(),
  amounts: z.object({
    currency: z.union([z.enum(['ARS', 'USD']), z.string()]).nullish(),
    net: numOrStr,
    iva: numOrStr,
    /** Obligatorio en la práctica; null se convierte a 0 y falla luego si no hay total usable. */
    total: z.union([z.number(), z.string()]).nullish(),
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
          .nullish(),
        percepciones: z
          .array(
            z.object({
              base: z.union([z.number(), z.string()]),
              rate: z.union([z.number(), z.string()]),
              amount: z.union([z.number(), z.string()]),
            })
          )
          .nullish(),
      })
      .nullish(),
  }),
  items: z
    .array(
      z.object({
        description: z.string(),
        qty: numOrStr,
        unitPrice: numOrStr,
        subtotal: numOrStr,
      })
    )
    .nullish(),
});

/** Contexto del comprador (la náutica) para no confundirlo con el proveedor. */
export interface ExpenseBuyerContext {
  schoolName?: string;
  razonSocial?: string;
  cuit?: string;
}

function normalizeCurrency(value: string | undefined | null): 'ARS' | 'USD' {
  if (!value || typeof value !== 'string') return 'ARS';
  const upper = value.trim().toUpperCase();
  if (
    upper === 'USD' ||
    upper === 'U$S' ||
    upper === 'US$' ||
    upper === 'DOL' ||
    upper === 'DÓLARES' ||
    upper === 'DOLARES'
  ) {
    return 'USD';
  }
  return 'ARS';
}

function normalizeNameKey(value: string | undefined | null): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|sociedad anonima)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function namesMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  const ka = normalizeNameKey(a);
  const kb = normalizeNameKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

function isSameParty(
  party: { name?: string | null; cuit?: string | null } | null | undefined,
  buyer: ExpenseBuyerContext | undefined
): boolean {
  if (!party || !buyer) return false;
  const partyCuit = normalizeCuit(party.cuit ?? undefined);
  const buyerCuit = normalizeCuit(buyer.cuit);
  if (partyCuit && buyerCuit && partyCuit === buyerCuit) return true;
  if (namesMatch(party.name, buyer.razonSocial)) return true;
  if (namesMatch(party.name, buyer.schoolName)) return true;
  return false;
}

function normalizeAIOutput(
  raw: z.infer<typeof RawAIOutputSchema>,
  buyerContext?: ExpenseBuyerContext
): AIExtractedExpense {
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

  let supplierName = raw.supplier?.name?.trim() || undefined;
  let supplierCuitRaw = raw.supplier?.cuit?.trim();
  let supplierIvaCondition = raw.supplier?.ivaCondition?.trim() || undefined;

  // Si la IA puso a la náutica (comprador) como proveedor, corregir con el otro bloque.
  if (isSameParty({ name: supplierName, cuit: supplierCuitRaw }, buyerContext)) {
    const buyerName = raw.buyer?.name?.trim();
    const buyerCuit = raw.buyer?.cuit?.trim();
    if (buyerName && !isSameParty({ name: buyerName, cuit: buyerCuit }, buyerContext)) {
      supplierName = buyerName;
      supplierCuitRaw = buyerCuit;
      supplierIvaCondition = undefined;
    } else {
      // No hay candidato confiable: no guardar la náutica como proveedor.
      supplierName = undefined;
      supplierCuitRaw = undefined;
      supplierIvaCondition = undefined;
    }
  }

  const cuitResult = supplierCuitRaw
    ? normalizeAndValidateCuit(supplierCuitRaw)
    : undefined;

  const conceptFromItems =
    raw.items && raw.items.length > 0
      ? raw.items.map((i) => i.description).join('; ')
      : undefined;

  return {
    concept: raw.concept?.trim() || conceptFromItems,
    supplier: {
      name: supplierName,
      cuit: cuitResult?.raw ?? supplierCuitRaw,
      ivaCondition: supplierIvaCondition,
    },
    invoice: {
      type: raw.invoice?.type?.trim() || undefined,
      letter: raw.invoice?.letter?.trim() || undefined,
      pos: raw.invoice?.pos != null ? String(raw.invoice.pos).trim() : undefined,
      number:
        raw.invoice?.number != null ? String(raw.invoice.number).trim() : undefined,
      issueDate:
        normalizeDate(raw.invoice?.issueDate ?? '') ??
        (raw.invoice?.issueDate?.trim() || undefined),
      cae: raw.invoice?.cae?.trim() || undefined,
      caeDue:
        normalizeDate(raw.invoice?.caeDue ?? '') ??
        (raw.invoice?.caeDue?.trim() || undefined),
    },
    amounts: {
      currency: normalizeCurrency(raw.amounts.currency),
      net: net as number | undefined,
      iva: iva as number | undefined,
      total,
      breakdown:
        alicuotas || percepciones ? { alicuotas, percepciones } : undefined,
    },
    items: raw.items?.map((i) => ({
      description: i.description,
      qty: normalizeNumber(i.qty),
      unitPrice: normalizeNumber(i.unitPrice),
      subtotal: normalizeNumber(i.subtotal),
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
 * Parsea una imagen o PDF de factura/ticket y devuelve datos estructurados.
 * @param imageBase64 - Imagen o PDF en base64 (data URL o raw)
 * @param mimeType - image/jpeg, image/png, application/pdf, etc.
 * @param buyerContext - Identidad de la náutica (comprador) para no usarla como proveedor
 */
export async function parseExpenseFromImage(
  imageBase64: string,
  mimeType: string = 'image/jpeg',
  buyerContext?: ExpenseBuyerContext
): Promise<ParseExpenseResult> {
  if (!hasGeminiApiKey()) {
    throw new Error(getGeminiApiKeyMissingMessage());
  }

  const modelName = await getAvailableGeminiModel();
  if (!modelName) {
    throw new Error('No se pudo obtener un modelo Gemini. Verificá la API key.');
  }

  // Quitar prefijo data URL si existe
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const buyerLines: string[] = [];
  if (buyerContext?.razonSocial) {
    buyerLines.push(`- Razón social: ${buyerContext.razonSocial}`);
  }
  if (buyerContext?.schoolName) {
    buyerLines.push(`- Nombre de la náutica: ${buyerContext.schoolName}`);
  }
  if (buyerContext?.cuit) {
    buyerLines.push(`- CUIT: ${buyerContext.cuit}`);
  }
  const buyerBlock =
    buyerLines.length > 0
      ? `
CONTEXTO DEL COMPRADOR (nuestra náutica / receptor de la factura):
${buyerLines.join('\n')}
Estos datos son del RECEPTOR/CLIENTE (quien compra/paga). NUNCA los uses como supplier (proveedor). El proveedor es quien EMITE la factura (bloque superior / emisor / vendedor).
`
      : '';

  const promptText = `
Eres un asistente que extrae datos de facturas y tickets de compra (Argentina).

IMPORTANTE: Solo considerá el texto impreso de la factura. Las anotaciones manuscritas, tachaduras, notas o sellos agregados por personas NO deben influir en los datos extraídos. Ignoralas por completo.
${buyerBlock}
Analizá la imagen y devolvé un JSON con esta estructura exacta (sin markdown, solo JSON):

{
  "supplier": {
    "name": "Razón social o nombre del EMISOR (quien emite/vende)",
    "cuit": "CUIT del emisor con formato XX-XXXXXXXX-X",
    "ivaCondition": "Condición IVA del emisor si aparece (ej: IVA Responsable Inscripto)"
  },
  "buyer": {
    "name": "Razón social o nombre del RECEPTOR/CLIENTE (quien compra)",
    "cuit": "CUIT del receptor si aparece"
  },
  "concept": "Descripción breve del gasto o productos/servicios comprados (ej: Combustible, Reparación motor, etc.)",
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
    "currency": "ARS o USD según la factura",
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
- Extraé SOLO datos impresos (texto de la factura/ticket original). Ignorá anotaciones manuscritas, tachaduras, notas al margen, firmas, sellos adicionales o cualquier cosa escrita a mano. No uses esos datos para el JSON.
- PROVEEDOR (supplier) = EMISOR de la factura: bloque de cabecera del vendedor, razón social grande arriba, CUIT del emisor. NO es el cliente.
- COMPRADOR (buyer) = RECEPTOR/CLIENTE: bloque "Cliente", "Señor/es", "Receptor", "Doc. Nro", datos de quien compra. NUNCA copies buyer a supplier.
- Si es ticket sin IVA, net y iva pueden omitirse; total es obligatorio.
- Fechas en dd/mm/yyyy.
- Números: en Argentina el punto separa miles (6.880 = 6880) y la coma decimales (68,8 = 68.8). Devolvé el valor numérico correcto: si la factura dice $6.880, devolvé 6880; si dice $68,80, devolvé 68.8.
- Moneda (currency): ES CRÍTICO detectar si es pesos o dólares. Buscá indicadores como: "US$", "USD", "U$S", "Dólares", "Dólares USA", "DOL" → currency: "USD". Si dice "ARS", "Pesos", "$" (sin US), "Pesos Argentinos" o no hay indicación de dólares → currency: "ARS".
- Si no encontrás un dato, omitilo del JSON (no pongas null).
- items es opcional; si la factura no tiene ítems detallados, omitilo.
- breakdown es opcional.
- buyer es opcional pero útil si aparecen ambos bloques.
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
    throw new Error(
      'La IA no devolvió texto. El archivo puede estar borroso, vacío o en un formato no soportado.'
    );
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

  const extracted = normalizeAIOutput(rawResult.data, buyerContext);
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
