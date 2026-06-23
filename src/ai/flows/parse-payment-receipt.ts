/**
 * Flujo para extraer datos de comprobantes de pago (cheque, transferencia, cupón de tarjeta)
 * usando Gemini Vision.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'zod';
import {
  getAvailableGeminiModel,
  hasGeminiApiKey,
  getGeminiApiKeyMissingMessage,
} from '@/ai/get-available-gemini-model';
import { normalizeNumber, normalizeDate } from '@/lib/expenses/normalize';

export type PaymentReceiptType = 'cheque' | 'transfer' | 'credit_card';

const RawAIOutputSchema = z.object({
  documentType: z.enum(['cheque', 'transfer', 'credit_card']),
  amount: z.union([z.number(), z.string()]),
  date: z.string().optional(),
  currency: z.string().optional(),
  // Cheque
  bank: z.string().optional(),
  chequeNumber: z.union([z.string(), z.number()]).optional(),
  issuer: z.string().optional(),
  payee: z.string().optional(),
  // Transferencia
  referenceNumber: z.union([z.string(), z.number()]).optional(),
  fromAccount: z.string().optional(),
  toAccount: z.string().optional(),
  // Cupón tarjeta
  cardType: z.string().optional(),
  last4: z.union([z.string(), z.number()]).optional(),
  establishment: z.string().optional(),
});

export type ParsedPaymentReceipt = z.infer<typeof ParsedPaymentReceiptSchema>;

export const ParsedPaymentReceiptSchema = z.object({
  documentType: z.enum(['cheque', 'transfer', 'credit_card']),
  amount: z.number(),
  date: z.string().optional(),
  currency: z.string().optional(),
  bank: z.string().optional(),
  chequeNumber: z.string().optional(),
  issuer: z.string().optional(),
  payee: z.string().optional(),
  referenceNumber: z.string().optional(),
  fromAccount: z.string().optional(),
  toAccount: z.string().optional(),
  cardType: z.string().optional(),
  last4: z.string().optional(),
  establishment: z.string().optional(),
});

function normalizeOutput(raw: z.infer<typeof RawAIOutputSchema>): ParsedPaymentReceipt {
  const amount =
    typeof raw.amount === 'number'
      ? raw.amount
      : (normalizeNumber(raw.amount) ?? (parseFloat(String(raw.amount)) || 0));
  const date = raw.date ? (normalizeDate(raw.date) ?? raw.date.trim()) : undefined;

  return {
    documentType: raw.documentType,
    amount,
    date,
    currency: raw.currency?.trim() || 'ARS',
    bank: raw.bank?.trim(),
    chequeNumber: raw.chequeNumber != null ? String(raw.chequeNumber).trim() : undefined,
    issuer: raw.issuer?.trim(),
    payee: raw.payee?.trim(),
    referenceNumber: raw.referenceNumber != null ? String(raw.referenceNumber).trim() : undefined,
    fromAccount: raw.fromAccount?.trim(),
    toAccount: raw.toAccount?.trim(),
    cardType: raw.cardType?.trim(),
    last4: raw.last4 != null ? String(raw.last4).replace(/\D/g, '').slice(-4) : undefined,
    establishment: raw.establishment?.trim(),
  };
}

export interface ParsePaymentReceiptResult {
  extracted: ParsedPaymentReceipt;
  confidence: number;
  rawText?: string;
  model: string;
}

export async function parsePaymentReceiptFromImage(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<ParsePaymentReceiptResult> {
  if (!hasGeminiApiKey()) {
    throw new Error(getGeminiApiKeyMissingMessage());
  }

  const modelName = await getAvailableGeminiModel();
  if (!modelName) {
    throw new Error('No se pudo obtener un modelo Gemini. Verificá la API key.');
  }

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const promptText = `
Eres un asistente que analiza comprobantes de pago (Argentina).

Analizá la imagen y determiná el TIPO de comprobante:
- "cheque": si es un cheque
- "transfer": si es comprobante de transferencia bancaria
- "credit_card": si es cupón de tarjeta de crédito/débito

Devolvé un JSON con esta estructura exacta (sin markdown, solo JSON):

{
  "documentType": "cheque" | "transfer" | "credit_card",
  "amount": número (monto pagado),
  "date": "dd/mm/yyyy" o "yyyy-mm-dd",
  "currency": "ARS" o "USD",
  "bank": "nombre del banco" (si aplica),
  "chequeNumber": "número de cheque" (solo para cheques),
  "issuer": "librador o emisor del cheque" (solo para cheques),
  "payee": "beneficiario del cheque" (solo para cheques),
  "referenceNumber": "número de operación o CBU" (solo para transferencias),
  "fromAccount": "cuenta origen" (solo para transferencias),
  "toAccount": "cuenta destino" (solo para transferencias),
  "cardType": "Visa, Mastercard, etc." (solo para cupones tarjeta),
  "last4": "últimos 4 dígitos de la tarjeta" (solo para cupones tarjeta),
  "establishment": "comercio o establecimiento" (solo para cupones tarjeta)
}

Reglas:
- Solo incluí los campos que apliquen al tipo de documento.
- amount es obligatorio.
- Números: en Argentina punto separa miles (6.880 = 6880), coma decimales (68,8 = 68.8).
- Si no encontrás un dato, omitilo.
- Ignorá anotaciones manuscritas, tachaduras o sellos adicionales.
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
    config: { temperature: 0.1 },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('La IA no devolvió texto. El archivo puede estar borroso o vacío.');
  }

  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1]!.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('La IA devolvió un JSON inválido.');
  }

  const rawResult = RawAIOutputSchema.safeParse(parsed);
  if (!rawResult.success) {
    throw new Error(`Datos extraídos inválidos: ${rawResult.error.message}`);
  }

  const extracted = normalizeOutput(rawResult.data);
  const validated = ParsedPaymentReceiptSchema.safeParse(extracted);
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
