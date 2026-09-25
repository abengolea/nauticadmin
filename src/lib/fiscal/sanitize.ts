/**
 * Sanitización de request/response fiscal para persistencia (sin secretos).
 */

export function sanitizeFiscalXml(xml: string): string {
  return xml
    .replace(/<Token>[\s\S]*?<\/Token>/gi, '<Token>[REDACTED]</Token>')
    .replace(/<Sign>[\s\S]*?<\/Sign>/gi, '<Sign>[REDACTED]</Sign>');
}

export function truncateForStorage(text: string, max = 8000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…[truncated]`;
}
