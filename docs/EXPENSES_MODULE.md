# Módulo de Gastos

Control de gastos con captura de facturas por foto, extracción de datos con IA y cuenta corriente por proveedor.

## Configuración

### Variables de entorno

Agregá a `.env.local`:

```env
# Ya existentes para Firebase
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# Para extracción con IA (Gemini Vision)
GEMINI_API_KEY=tu_api_key
# O alternativamente: GOOGLE_API_KEY o GOOGLE_GENAI_API_KEY
```

Obtener API key: https://aistudio.google.com/apikey

### Índices Firestore

Si usás filtros por `status` + `amounts.total`, creá el índice compuesto en Firebase Console o agregá a `firestore.indexes.json`:

```json
{
  "collectionGroup": "expenses",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "amounts.total", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

## Uso

1. **Cargar gasto**: Dashboard → Gastos → Cargar gasto → Sacar foto o elegir imagen → Subir y extraer con IA
2. **Confirmar**: Revisá los datos extraídos, editá si hace falta y confirmá
3. **Listado**: Filtrá por estado (borrador, confirmado, pagado)
4. **Cuenta corriente**: Cargar proveedores → Elegir proveedor para ver debe/haber/saldo

## Colecciones Firestore

- `schools/{schoolId}/expenses/{expenseId}` - Gastos
- `schools/{schoolId}/expenseVendors/{vendorId}` - Proveedores (opcional)
- `schools/{schoolId}/vendorAccounts/{vendorId}/entries/{entryId}` - Cuenta corriente
- `schools/{schoolId}/expensePayments/{paymentId}` - Pagos aplicados

## Storage

- `schools/{schoolId}/expenses/{expenseId}/original.{ext}` - Imagen original
- `schools/{schoolId}/expenses/{expenseId}/thumb.{ext}` - Thumbnail

## API

- `POST /api/expenses/upload` - Sube imagen y crea draft (FormData: file, schoolId)
- `POST /api/expenses/parse` - Extrae datos con IA (body: expenseId, schoolId, storagePath)
- `GET /api/expenses?schoolId=...&status=...` - Lista gastos
- `PATCH /api/expenses` - Confirma o actualiza gasto
- `GET /api/expenses/[id]?schoolId=...` - Obtiene un gasto
- `GET /api/expenses/vendor-accounts/[vendorId]?schoolId=...` - Cuenta corriente

## Opciones de IA

**Implementado**: Gemini Vision + LLM (Genkit) - extrae JSON estructurado de la imagen.

**Alternativa no implementada**: Google Document AI para OCR + parser custom.
