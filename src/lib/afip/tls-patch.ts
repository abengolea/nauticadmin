/**
 * Parche para Node.js 18+ con OpenSSL 3.x: permite conexiones a servidores AFIP
 * que usan claves DH legacy (< 2048 bits). Node.js ignora OPENSSL_CONF, así que
 * parcheamos tls.createSecureContext antes de cualquier llamada de red.
 */
import tls from 'tls';
import { constants } from 'crypto';

const original = tls.createSecureContext.bind(tls);

(tls as any).createSecureContext = (options: any = {}) => {
  return original({
    ...options,
    ciphers: 'DEFAULT@SECLEVEL=0',
    secureOptions:
      (options.secureOptions || 0) |
      constants.SSL_OP_LEGACY_SERVER_CONNECT |
      constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
  });
};
