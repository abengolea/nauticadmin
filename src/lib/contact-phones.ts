/**
 * Helpers para uno o más teléfonos de contacto (cliente / proveedor).
 * Se mantiene `phone` (primer número) por compatibilidad con datos y flujos existentes.
 */

export type ContactPhonesSource = {
  phone?: string | null;
  phones?: string[] | null;
};

/** Normaliza y deduplica teléfonos (por dígitos). Conserva el formato original del primero visto. */
export function normalizePhones(
  ...sources: Array<string | string[] | null | undefined>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const src of sources) {
    const list = Array.isArray(src) ? src : src != null && src !== '' ? [src] : [];
    for (const raw of list) {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed) continue;
      const key = trimmed.replace(/\D/g, '') || trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

/** Teléfonos de un tutorContact / contacto, incluyendo el campo legacy `phone`. */
export function getContactPhones(source?: ContactPhonesSource | null): string[] {
  if (!source) return [];
  return normalizePhones(source.phones, source.phone);
}

/** Valores para inputs: al menos un campo vacío si no hay teléfonos. */
export function phonesForForm(source?: ContactPhonesSource | null): string[] {
  const phones = getContactPhones(source);
  return phones.length > 0 ? phones : [''];
}

/** Construye tutorContact con phone (primario) + phones (todos). */
export function buildTutorContact(
  name: string,
  phonesInput: string[] | string | undefined | null
): { name: string; phone: string; phones: string[] } {
  const phones = normalizePhones(phonesInput);
  return {
    name,
    phone: phones[0] ?? '',
    phones,
  };
}

/** Payload de teléfono para proveedor: phone + phones (vacío limpia el campo). */
export function buildVendorPhonesPayload(
  phonesInput: string[] | string | undefined | null
): { phone: string | null; phones: string[] } {
  const phones = normalizePhones(phonesInput);
  return {
    phone: phones[0] ?? null,
    phones,
  };
}

/** Texto legible para listados / exportación. */
export function formatPhonesDisplay(source?: ContactPhonesSource | null): string {
  return getContactPhones(source).join(', ');
}
