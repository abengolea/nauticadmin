import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

// Pasar la API key explícitamente para que Next.js la inyecte desde .env.local
const apiKey =
  process.env.GEMINI_API_KEY ??
  process.env.GOOGLE_API_KEY ??
  process.env.GOOGLE_GENAI_API_KEY;

export const ai = genkit({
  plugins: [googleAI(apiKey ? { apiKey } : {})],
  model: 'googleai/gemini-2.5-flash',
});
