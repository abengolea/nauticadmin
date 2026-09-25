/**
 * Cache de FEParamGetCondicionIvaReceptor por ambiente.
 */

import { getCondicionIvaReceptor, type CondicionIvaReceptorRow } from '@/lib/afip/wsfe';

export type { CondicionIvaReceptorRow };

let cache: { at: number; rows: CondicionIvaReceptorRow[] } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000;

export async function getCondicionIvaReceptorTable(
  forceRefresh = false
): Promise<CondicionIvaReceptorRow[]> {
  if (!forceRefresh && cache && Date.now() - cache.at < TTL_MS) {
    return cache.rows;
  }
  const rows = await getCondicionIvaReceptor();
  cache = { at: Date.now(), rows };
  return rows;
}

export function clearCondicionIvaCache(): void {
  cache = null;
}
