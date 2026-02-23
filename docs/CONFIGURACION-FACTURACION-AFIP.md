# Configuración: Facturación Electrónica AFIP (Notificas)

Guía para implementar la emisión automática de facturas electrónicas cada vez que la app recibe un pago de un cliente. Pensado para cualquier proyecto que use Cursor/Notificas y necesite facturar contra AFIP.

---

## 1. Resumen del flujo

```
Pago recibido (Mercado Pago, transferencia, etc.)
        │
        ▼
Webhook / evento de pago
        │
        ▼
POST /api/facturas/emit  (receptor + items)
        │
        ▼
AFIP WSFE → CAE
        │
        ▼
PDF generado en ./facturas/
        │
        ▼
Opcional: enviar PDF por email al cliente
```

---

## 2. Requisitos previos

- **CUIT** de la empresa emisora (ej: NOTIFICAS S. R. L.)
- **Certificado digital AFIP** (homologación o producción)
- **Punto de venta** y **tipo de comprobante** (ej: Factura B) dados de alta en AFIP
- Datos del **cliente receptor**: razón social, CUIT/DNI, domicilio

---

## 3. Variables de entorno

Copiar a `.env.local` (o el archivo de env que use tu app):

```env
# AFIP - Facturación Electrónica
# CUIT con o sin guiones (ej: 33-71729868-9 o 33717298689)
AFIP_CUIT=33717298689

# true = producción, false = homologación (pruebas)
AFIP_PRODUCTION=false

# Punto de venta (default 1)
AFIP_PTO_VTA=1

# Tipo comprobante: 6=Factura B, 11=Factura C (default 6)
AFIP_CBTE_TIPO=6

# Rutas a certificados (crear carpeta afip/ en la raíz del proyecto)
AFIP_CERT_PATH=./afip/certificado_homo.crt
AFIP_KEY_PATH=./afip/privada_homo.key
AFIP_CHAIN_PATH=./afip/chain.pem

# Datos del emisor (para el PDF)
AFIP_RAZON_SOCIAL=NOTIFICAS S. R. L.
AFIP_DOMICILIO=Av. Corrientes 1234, CABA
```

---

## 4. Certificados AFIP

### 4.1 Obtener certificados

1. Entrar a [AFIP](https://www.afip.gob.ar) con clave fiscal
2. **Homologación**: solicitar certificado de prueba en el entorno de testing
3. **Producción**: solicitar certificado para producción
4. Descargar: `.crt` (certificado), `.key` (clave privada), `chain.pem` (cadena)

### 4.2 Estructura de carpetas

```
proyecto/
├── afip/
│   ├── certificado_homo.crt   # homologación
│   ├── privada_homo.key
│   └── chain.pem
├── .env.local
└── ...
```

**Importante:** La carpeta `afip/` debe estar en `.gitignore`. Nunca subir certificados a Git.

---

## 5. Endpoint de emisión

### POST `/api/facturas/emit`

Emite una factura B/C a AFIP y genera el PDF.

**Body (JSON):**

```json
{
  "receptor": {
    "razonSocial": "Juan Pérez",
    "cuit": "20-12345678-9",
    "domicilio": "Av. Libertad 100, CABA",
    "condicionIVA": "Consumidor Final"
  },
  "items": [
    {
      "descripcion": "Servicios de suscripción mensual",
      "cantidad": 1,
      "precioUnitario": 15000
    }
  ],
  "concepto": "Servicios varios"
}
```

**Respuesta exitosa (200):**

```json
{
  "ok": true,
  "voucherNumber": 5,
  "CAE": "86080010915792",
  "CAEFchVto": "2026-03-04",
  "pdfPath": "C:/proyecto/facturas/factura-B-0001-00000005.pdf"
}
```

**Ejemplo con cURL (PowerShell):**

```powershell
Invoke-RestMethod -Uri "http://localhost:9002/api/facturas/emit" -Method POST -ContentType "application/json" -Body '{"receptor":{"razonSocial":"Juan Pérez","cuit":"20-12345678-9"},"items":[{"descripcion":"Servicios varios","cantidad":1,"precioUnitario":10000}]}'
```

---

## 6. Integración: facturar al recibir un pago

### 6.1 Webhook de Mercado Pago

Cuando Mercado Pago notifica un pago aprobado, llamar al endpoint de facturación:

```typescript
// En el webhook de Mercado Pago (ej: /api/payments/webhook/mercadopago)
export async function POST(request: Request) {
  const body = await request.json();
  
  if (body.type === 'payment' && body.data?.status === 'approved') {
    const paymentId = body.data.id;
    const payment = await getPaymentFromMercadoPago(paymentId);
    
    // Obtener datos del cliente (de tu DB según payer_id, etc.)
    const cliente = await getClienteByPayerId(payment.payer.id);
    
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/facturas/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receptor: {
          razonSocial: cliente.razonSocial ?? cliente.nombre,
          cuit: cliente.cuit,
          domicilio: cliente.domicilio ?? '-',
          condicionIVA: cliente.condicionIVA ?? 'Consumidor Final',
        },
        items: [{
          descripcion: payment.description ?? 'Pago recibido',
          cantidad: 1,
          precioUnitario: payment.transaction_amount,
        }],
      }),
    });
  }
  
  return new Response('OK', { status: 200 });
}
```

### 6.2 Pago manual / transferencia

Cuando un admin registra un pago manual:

```typescript
// Después de guardar el pago en Firestore/DB
const result = await fetch('/api/facturas/emit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    receptor: {
      razonSocial: playerName,
      cuit: playerCuit,  // O DNI si es consumidor final
      domicilio: '-',
    },
    items: [{
      descripcion: `Cuota ${period}`,
      cantidad: 1,
      precioUnitario: amount,
    }],
  }),
});

const { pdfPath, CAE, voucherNumber } = await result.json();
// Opcional: enviar PDF por email, guardar referencia en el pago
```

### 6.3 Script de prueba (sin webhook)

```bash
npm run emit:invoice
```

Emite una factura de prueba ($100 + IVA) y genera el PDF en `./facturas/`.

---

## 7. Datos del receptor

| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| `razonSocial` | Sí | Nombre o razón social del cliente |
| `cuit` | Sí | CUIT (11 dígitos) o DNI según tipo de comprobante |
| `domicilio` | No | Default: "-" |
| `condicionIVA` | No | Default: "Consumidor Final" |

**Factura B** (consumidores finales): CUIT o DNI.  
**Factura C** (responsables inscriptos): CUIT obligatorio.

---

## 8. Homologación vs Producción

| Variable | Homologación | Producción |
|----------|--------------|------------|
| `AFIP_PRODUCTION` | `false` | `true` |
| Certificados | De AFIP homologación | De AFIP producción |
| URL AFIP | wswhomo.afip.gov.ar | servicios1.afip.gov.ar |

**Importante:** Probar siempre en homologación antes de pasar a producción.

### 8.1 Pasos para pasar a producción (facturas reales)

1. **Obtener certificados de producción** en AFIP:
   - Entrar a [AFIP](https://www.afip.gob.ar) con clave fiscal
   - Solicitar certificado para **producción** (no homologación)
   - Descargar: `.crt`, `.key`, y `chain.pem` de producción

2. **Guardar los archivos** en `afip/`:
   ```
   afip/
   ├── certificado_prod.crt   # certificado de producción
   ├── privada_prod.key       # clave privada de producción
   └── chain_prod.pem        # cadena de producción (puede ser la misma que homo)
   ```

3. **Actualizar `.env.local`**:
   ```env
   AFIP_PRODUCTION=true
   AFIP_CERT_PATH=./afip/certificado_prod.crt
   AFIP_KEY_PATH=./afip/privada_prod.key
   AFIP_CHAIN_PATH=./afip/chain_prod.pem
   ```

4. **Borrar el TA de homologación** (opcional, para evitar confusiones):
   ```bash
   del afip\ta_wsfe_homo.json
   ```

5. **Probar con una factura de prueba**:
   ```bash
   npm run emit:invoice
   ```

6. **Caché del TA**: En producción se usa `ta_wsfe_prod.json`. El sistema reutiliza el TA válido automáticamente.

---

## 9. Archivos del proyecto (referencia)

| Archivo | Función |
|---------|---------|
| `src/lib/afip/wsaa.ts` | Autenticación WSAA (token AFIP) |
| `src/lib/afip/wsfe.ts` | Emisión de comprobantes (FECAESolicitar) |
| `src/lib/factura-pdf.ts` | Generación de PDF con CAE y QR |
| `src/app/api/facturas/emit/route.ts` | Endpoint POST de emisión |
| `scripts/emit-test-invoice.ts` | Script de prueba |

---

## 10. Checklist para nueva app

- [ ] Crear carpeta `afip/` y agregar certificados
- [ ] Configurar variables de entorno (`.env.local`)
- [ ] Copiar módulos: `src/lib/afip/`, `src/lib/factura-pdf.ts`
- [ ] Copiar endpoint: `src/app/api/facturas/emit/`
- [ ] Instalar dependencias: `jspdf`, `qrcode`, `axios`, `node-forge`
- [ ] Crear carpeta `facturas/` (o la que use `FACTURAS_DIR`)
- [ ] Integrar llamada a `/api/facturas/emit` en el webhook/evento de pago
- [ ] Probar con `npm run emit:invoice` o script equivalente

---

## 11. Envío del PDF al cliente

Tras emitir, el PDF se guarda en `./facturas/factura-B-XXXX-XXXXXXXX.pdf`. Para enviarlo por email:

1. **Opción A:** Subir a Firebase Storage / S3 y generar URL firmada
2. **Opción B:** Adjuntar el buffer del PDF al email (Trigger Email, SendGrid, etc.)
3. **Opción C:** Devolver el PDF como descarga si el endpoint se llama desde el frontend

Ejemplo con buffer (el endpoint ya genera el archivo; se puede leer y adjuntar):

```typescript
const pdfBuffer = fs.readFileSync(pdfPath);
await sendEmail({
  to: cliente.email,
  subject: `Factura Nº ${voucherNumber}`,
  attachments: [{ filename: `factura-${voucherNumber}.pdf`, content: pdfBuffer }],
});
```

---

## 12. Errores frecuentes

| Error | Causa | Solución |
|-------|-------|----------|
| `AFIP_CUIT no configurado` | Falta variable de entorno | Agregar `AFIP_CUIT` en `.env.local` |
| `Certificados no encontrados` | Rutas incorrectas | Verificar `AFIP_CERT_PATH`, `AFIP_KEY_PATH`, `AFIP_CHAIN_PATH` |
| `10246 Condicion IVA receptor` | Campo obligatorio RG 5616 | Ya implementado con `CondicionIVAReceptorId` |
| `CUIT del receptor inválido` | CUIT mal formado | Debe tener 11 dígitos (con o sin guiones) |

---

*Documento generado para proyectos Notificas / Cursor. Última actualización: 2026-02.*
