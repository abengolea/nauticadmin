/**
 * Tests para el parser de respuesta WSAA (AFIP).
 */

import { describe, it, expect } from 'vitest';
import { parseLoginCmsResponse } from '../../../lib/afip/wsaa';

describe('parseLoginCmsResponse', () => {
  it('extrae token y sign de respuesta con loginCmsReturn HTML-encoded', () => {
    // Respuesta típica de AFIP: el XML del TA viene HTML-encoded dentro de loginCmsReturn
    const soapResponse = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <loginCmsResponse>
      <loginCmsReturn>&lt;?xml version="1.0" encoding="UTF-8"?&gt;
&lt;loginTicketResponse&gt;
  &lt;credentials&gt;
    &lt;token&gt;PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4K...&lt;/token&gt;
    &lt;sign&gt;c2lnbmF0dXJlX2Jhc2U2NA==&lt;/sign&gt;
    &lt;expirationTime&gt;2026-02-21T02:00:00.000-03:00&lt;/expirationTime&gt;
  &lt;/credentials&gt;
&lt;/loginTicketResponse&gt;</loginCmsReturn>
    </loginCmsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

    const result = parseLoginCmsResponse(soapResponse);

    expect(result.token).toBe('PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4K...');
    expect(result.sign).toBe('c2lnbmF0dXJlX2Jhc2U2NA==');
    expect(result.expirationTime).toBe('2026-02-21T02:00:00.000-03:00');
  });

  it('extrae token y sign de respuesta con namespace (wsaa:loginCmsReturn)', () => {
    const soapResponse = `<?xml version="1.0"?>
<soapenv:Envelope>
  <soapenv:Body>
    <wsaa:loginCmsResponse>
      <wsaa:loginCmsReturn>&lt;loginTicketResponse&gt;&lt;credentials&gt;&lt;token&gt;TOKEN123&lt;/token&gt;&lt;sign&gt;SIGN456&lt;/sign&gt;&lt;/credentials&gt;&lt;/loginTicketResponse&gt;</wsaa:loginCmsReturn>
    </wsaa:loginCmsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

    const result = parseLoginCmsResponse(soapResponse);

    expect(result.token).toBe('TOKEN123');
    expect(result.sign).toBe('SIGN456');
  });

  it('decodifica correctamente &amp; y &quot;', () => {
    const soapResponse = `<?xml version="1.0"?>
<loginCmsResponse>
  <loginCmsReturn>&lt;r&gt;&lt;token&gt;a&amp;b&lt;/token&gt;&lt;sign&gt;x&quot;y&lt;/sign&gt;&lt;/r&gt;</loginCmsReturn>
</loginCmsResponse>`;

    const result = parseLoginCmsResponse(soapResponse);

    expect(result.token).toBe('a&b');
    expect(result.sign).toBe('x"y');
  });
});
