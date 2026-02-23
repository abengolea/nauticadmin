/**
 * Configuración AFIP para facturación electrónica.
 * Integración directa con AFIP (WSAA + WSFE), sin AfipSDK.
 */

export interface AfipConfig {
  cuit: number;
  production: boolean;
  /** Punto de venta por defecto (ej: 1) */
  ptoVta: number;
  /** Tipo de comprobante por defecto: 6=Factura B, 11=Factura C */
  cbteTipo: number;
}

function certFilesExist(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  try {
    const fs = require('fs');
    const path = require('path');
    const certPath = process.env.AFIP_CERT_PATH ?? 'afip/certificado_homo.crt';
    const keyPath = process.env.AFIP_KEY_PATH ?? 'afip/privada_homo.key';
    const chainPath = process.env.AFIP_CHAIN_PATH ?? 'afip/chain.pem';
    if (!certPath || !keyPath || !chainPath) return false;
    const base = process.cwd();
    return (
      fs.existsSync(path.resolve(base, certPath)) &&
      fs.existsSync(path.resolve(base, keyPath)) &&
      fs.existsSync(path.resolve(base, chainPath))
    );
  } catch {
    return false;
  }
}

/**
 * Obtiene la configuración AFIP desde variables de entorno.
 * Requiere AFIP_CUIT y archivos certificado_homo.crt, privada_homo.key, chain.pem.
 * Si no está configurado, retorna null (usar stub).
 */
export function getAfipConfig(): AfipConfig | null {
  const cuitStr = process.env.AFIP_CUIT;
  if (!cuitStr || cuitStr.trim() === '') return null;

  const cuit = parseInt(cuitStr.replace(/\D/g, ''), 10);
  if (isNaN(cuit) || cuit.toString().length !== 11) return null;

  if (!certFilesExist()) {
    console.warn('[afip-config] Certificados no encontrados (AFIP_CERT_PATH, AFIP_KEY_PATH, AFIP_CHAIN_PATH). Usando stub.');
    return null;
  }

  const production = process.env.AFIP_PRODUCTION === 'true';
  const ptoVta = parseInt(process.env.AFIP_PTO_VTA ?? '1', 10) || 1;
  const cbteTipo = parseInt(process.env.AFIP_CBTE_TIPO ?? '6', 10) || 6;

  return { cuit, production, ptoVta, cbteTipo };
}
