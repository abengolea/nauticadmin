# Diseño: Detección de Pagos Duplicados + Facturación Idempotente + AFIP

## 1. Diagrama de Estados

### Payment (estados de duplicado)
```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                     INGESTA DE PAGO                          │
                    └─────────────────────────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
                    ▼                         ▼                         ▼
            providerPaymentId          fingerprintHash           Sin duplicado
            ya existe?                 coincide en ventana?       detectado
                    │                         │                         │
                    │ SÍ                      │ SÍ                      │ NO
                    ▼                         ▼                         ▼
            duplicate_webhook_         duplicateStatus:          duplicateStatus:
            ignored (no crear)         suspected                  none
                    │                         │                         │
                    │                         ▼                         │
                    │                 DuplicateCase open                │
                    │                         │                         │
                    └─────────────────────────┼─────────────────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │         RESOLUCIÓN ADMIN                         │
                    └─────────────────────────┼─────────────────────────┘
                                              │
                    ┌────────────┬────────────┼────────────┬────────────┐
                    │            │            │            │            │
                    ▼            ▼            ▼            ▼            ▼
            invoice_one_   invoice_all   refund_one   ignore_      (pendiente)
            credit_rest                 (anular)     duplicates
                    │            │            │            │
                    ▼            ▼            ▼            ▼
            duplicateStatus: confirmed | ignored
            InvoiceOrder(s) creadas según resolución
```

### InvoiceOrder (estados de emisión)
```
    pending ──► issuing ──► issued ──► pdf_ready ──► email_sent
        │           │           │
        │           │           └──► failed (retry)
        │           └──► failed (retry)
        └──► failed (retry)
```

### DuplicateCase
```
    open ──► resolved | dismissed
```

---

## 2. Diseño de Datos (Firestore)

### Colecciones

| Colección | Descripción |
|-----------|-------------|
| `payments` | Existente. Se extiende con campos nuevos. |
| `duplicateCases` | Casos de duplicado detectados |
| `invoiceOrders` | Órdenes de facturación (1:1 con factura AFIP) |
| `auditLog` | Log de auditoría (acciones admin) |
| `customerCredits` | Créditos/saldo a favor por cliente (schoolId + playerId) |

### Índices Firestore recomendados

```
# payments
- (schoolId, status, createdAt DESC)
- (schoolId, duplicateStatus, createdAt DESC)  [NUEVO]
- (provider, providerPaymentId)  [UNIQUE lookup - ya existe implícito]
- (schoolId, fingerprintHash, paidAt)  [NUEVO - para detección]

# duplicateCases
- (schoolId, status) where status == 'open'
- (schoolId, createdAt DESC)

# invoiceOrders
- (schoolId, status)
- (invoiceKey)  [para lookup idempotente - considerar doc id = hash]
- (schoolId, createdAt DESC)
```

---

## 3. Modelos de Datos

### Payment (extendido)

Campos existentes + nuevos:

```typescript
// NUEVOS campos a agregar (retrocompatibles)
method?: "card" | "transfer" | "cash" | "unknown";
reference?: string | null;
fingerprintHash?: string;
duplicateStatus?: "none" | "suspected" | "confirmed" | "ignored";
duplicateCaseId?: string | null;
updatedAt?: Date;

// Mapeo status: "approved" -> "accredited" (mantener approved para compatibilidad)
```

### DuplicateCase

```typescript
interface DuplicateCase {
  id: string;
  schoolId: string;
  customerId: string;  // playerId en el contexto de escuelas
  fingerprintHash: string;
  windowMinutes: number;
  paymentIds: string[];
  status: "open" | "resolved" | "dismissed";
  resolution?: {
    type: "invoice_one_credit_rest" | "invoice_all" | "refund_one" | "ignore_duplicates";
    chosenPaymentIds: string[];
    notes: string;
    resolvedBy: string;
    resolvedAt: string;  // ISO
  };
  createdAt: Date;
  updatedAt: Date;
}
```

### InvoiceOrder

```typescript
interface InvoiceOrder {
  id: string;
  schoolId: string;
  customerId: string;  // playerId
  periodKey: string | null;  // "2026-02"
  concept: string;
  amount: number;
  currency: string;
  paymentIdsApplied: string[];
  invoiceKey: string;  // UNIQUE - sha256(customerId+concept+periodKey+amount+currency)
  status: "pending" | "issuing" | "issued" | "pdf_ready" | "email_sent" | "failed";
  afip?: {
    ptoVta: number;
    cbteTipo: number;
    cbteNro: number;
    cae: string;
    caeVto: string;
  };
  pdfUrl?: string | null;
  email?: {
    to: string;
    messageId?: string;
    sentAt?: string;
  };
  failureReason?: string;
  retryCount?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### CustomerCredit (crédito/saldo a favor)

```typescript
interface CustomerCredit {
  id: string;
  schoolId: string;
  customerId: string;  // playerId
  amount: number;
  currency: string;
  sourcePaymentIds: string[];
  sourceDuplicateCaseId?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### AuditLogEntry (extendido)

```typescript
// Usar AuditLogEntry existente en types/index.ts
// Agregar resourceType: "duplicate_case" | "invoice_order"
```

---

## 4. Estructura de Carpetas Propuesta

```
src/
├── lib/
│   ├── duplicate-payments/           # NUEVO módulo
│   │   ├── types.ts                  # DuplicateCase, InvoiceOrder, etc.
│   │   ├── fingerprint.ts            # Cálculo fingerprintHash
│   │   ├── payment-ingestion.ts      # PaymentIngestionService
│   │   ├── duplicate-detection.ts    # DuplicateDetectionService
│   │   ├── invoice-order.ts          # InvoiceOrderService
│   │   ├── issuer-worker.ts          # Procesa cola pending/failed
│   │   ├── afip-stub.ts              # Interface + stub WSFE
│   │   ├── pdf-generator.ts          # Interface + stub PDF
│   │   └── email-sender.ts            # Interface (usa mail collection)
│   ├── payments/                     # Existente - integrar
│   │   ├── db.ts                     # Extender createPayment, toPayment
│   │   └── ...
│   └── types/
│       └── payments.ts               # Extender Payment
├── app/
│   ├── api/
│   │   ├── payments/
│   │   │   ├── webhook/...           # Integrar ingestion
│   │   │   ├── ingest/route.ts       # NUEVO - ingesta manual
│   │   │   └── ...
│   │   ├── duplicate-cases/          # NUEVO
│   │   │   ├── route.ts              # GET list
│   │   │   └── [caseId]/
│   │   │       ├── resolve/route.ts  # POST resolver
│   │   │       └── route.ts          # GET detalle
│   │   ├── invoice-orders/           # NUEVO
│   │   │   ├── route.ts              # GET list, POST create
│   │   │   └── [orderId]/
│   │   │       └── retry/route.ts    # POST retry
│   │   └── issuer-worker/            # NUEVO (o cron)
│   │       └── process/route.ts      # Procesa cola
│   └── dashboard/
│       └── payments/
│           └── duplicates/           # NUEVO
│               ├── page.tsx          # Tablero alertas
│               └── [caseId]/
│                   └── page.tsx      # Detalle + resolución
└── __tests__/
    └── lib/
        └── duplicate-payments/
            ├── payment-ingestion.test.ts
            ├── duplicate-detection.test.ts
            └── invoice-order.test.ts
```

---

## 5. Reglas de Negocio

1. **Dedupe técnico**: `provider + providerPaymentId` → upsert, no crear
2. **Dedupe contable**: `fingerprintHash` en ventana ±windowMinutes
3. **Fingerprint**: `sha256(customerId|amount|currency|normalizedRef|method|timeBucket)`
4. **timeBucket**: `Math.floor(paidAt/60000) * 60000` (ventana 1 min) o similar
5. **invoiceKey**: `sha256(customerId|concept|periodKey|amount|currency)` - único por orden
6. **Default**: DuplicateCase open → NO facturar automáticamente
7. **Crédito**: "invoice_one_credit_rest" → 1 InvoiceOrder + CustomerCredit para el resto

---

## 7. Archivos Creados/Modificados

### Nuevos
- `src/lib/duplicate-payments/types.ts`
- `src/lib/duplicate-payments/fingerprint.ts`
- `src/lib/duplicate-payments/fingerprint.test.ts`
- `src/lib/duplicate-payments/duplicate-detection.ts`
- `src/lib/duplicate-payments/duplicate-case-db.ts`
- `src/lib/duplicate-payments/payment-ingestion.ts`
- `src/lib/duplicate-payments/invoice-key.ts`
- `src/lib/duplicate-payments/invoice-order.ts`
- `src/lib/duplicate-payments/afip-stub.ts`
- `src/lib/duplicate-payments/pdf-generator.ts`
- `src/lib/duplicate-payments/email-sender.ts`
- `src/lib/duplicate-payments/issuer-worker.ts`
- `src/app/api/duplicate-cases/route.ts`
- `src/app/api/duplicate-cases/[caseId]/route.ts`
- `src/app/api/duplicate-cases/[caseId]/resolve/route.ts`
- `src/app/api/payments/ingest/route.ts`
- `src/app/api/issuer-worker/process/route.ts`
- `src/app/dashboard/payments/duplicates/page.tsx`
- `src/app/dashboard/payments/duplicates/[caseId]/page.tsx`
- `src/__tests__/lib/duplicate-payments/payment-ingestion.test.ts`
- `firestore.indexes.json`

### Modificados
- `src/lib/types/payments.ts` — campos extendidos (method, reference, fingerprintHash, duplicateStatus, duplicateCaseId)
- `src/lib/payments/constants.ts` — colecciones duplicateCases, invoiceOrders, customerCredits
- `src/lib/payments/db.ts` — toPayment con nuevos campos
- `src/app/api/payments/webhook/mercadopago/route.ts` — usa ingestPayment
- `src/app/dashboard/payments/page.tsx` — tab Duplicados

### Índices Firestore
Ejecutar `firebase deploy --only firestore:indexes` para crear los índices en `firestore.indexes.json`.

---

## 8. Flujo de Integración con Webhook MP

```
Webhook MP → processNotification
  → parseExternalReference
  → getPayment from MP API
  → PaymentIngestionService.ingestPayment({
      provider: 'mercadopago',
      providerPaymentId: String(paymentId),
      customerId: playerId,
      schoolId,
      period,
      amount,
      currency,
      paidAt,
      method: 'card',
      reference: external_reference
    })
  → Si isDuplicateTechnical: return (no crear)
  → Si duplicateCaseId: marcar pagos suspected, no enviar email recibo hasta resolver
  → Si no duplicado: createPayment + sendEmailEvent (como ahora)
```
