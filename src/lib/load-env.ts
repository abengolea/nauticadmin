/**
 * Carga .env.local explícitamente.
 * Importar como PRIMERA línea en API routes que usan GEMINI_API_KEY,
 * ya que Next.js/Turbopack a veces carga las env tarde.
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
