/**
 * Obtiene el nombre de un modelo Gemini disponible para la API key configurada.
 * Llama a la API de Google AI para listar modelos y elige el primero que sirva para texto.
 * Así evitamos NOT_FOUND cuando la cuenta solo tiene acceso a ciertos modelos/regiones.
 */

function getApiKey(): string | null {
  const key =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GOOGLE_GENAI_API_KEY;
  return key?.trim() || null;
}

const MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Orden de preferencia de modelos (el primero disponible se usa). */
const PREFERRED_MODEL_IDS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-001',
  'gemini-1.5-pro',
  'gemini-1.5-pro-001',
];

interface ListModelsResponse {
  models?: Array<{
    name: string;
    supportedGenerationMethods?: string[];
  }>;
}

/** Modelo por defecto cuando la API de listado falla pero la key existe */
const DEFAULT_MODEL = 'gemini-1.5-flash';

/**
 * Devuelve el ID de modelo (sin prefijo "models/") a usar, o null si no hay key o no hay modelos.
 */
export async function getAvailableGeminiModel(): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const res = await fetch(`${MODELS_URL}?pageSize=100`, {
      headers: { 'x-goog-api-key': apiKey },
    });
    if (!res.ok) {
      // Si la API falla (ej. key inválida, región), usar modelo por defecto
      console.warn(
        '[getAvailableGeminiModel] List models failed:',
        res.status,
        await res.text().catch(() => '')
      );
      return DEFAULT_MODEL;
    }

    const data = (await res.json()) as ListModelsResponse;
    const models = data.models ?? [];

    const supportsGenerate = (m: { supportedGenerationMethods?: string[] }) =>
      m.supportedGenerationMethods?.includes('generateContent') ?? false;

    const toId = (name: string) => name.replace(/^models\//, '');

    // Primero intentar por orden de preferencia
    for (const id of PREFERRED_MODEL_IDS) {
      const found = models.find(
        (m) => toId(m.name) === id && supportsGenerate(m)
      );
      if (found) return toId(found.name);
    }

    // Si no, cualquier Gemini que soporte generateContent
    const gemini = models.find(
      (m) =>
        supportsGenerate(m) &&
        (toId(m.name).startsWith('gemini-') || toId(m.name).startsWith('gemini/'))
    );
    if (gemini) return toId(gemini.name);

    // Lista vacía o sin match: usar modelo por defecto
    return DEFAULT_MODEL;
  } catch (err) {
    console.warn('[getAvailableGeminiModel] Error:', err);
    return DEFAULT_MODEL;
  }
}

/** Para verificar si la API key está configurada (sin hacer fetch) */
export function hasGeminiApiKey(): boolean {
  return !!getApiKey();
}
