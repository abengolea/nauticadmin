# Notas de Conciliación de Pagos

## Idempotencia

### payment_id
El identificador único de cada pago se genera con `makePaymentId()`:
```
hash(id_usuario + importBatchId + nro_tarjeta + importe + row_index)
```
- **Estable**: mismo Excel → mismo payment_id.
- **Evita duplicados**: al procesar, se usa `seenPaymentIds` para saltar pagos ya procesados en el mismo batch.
- **Entre batches**: si se reimporta el mismo Excel en un nuevo batch, se generan nuevos payment_id (distinto importBatchId). Los pagos no se consideran duplicados entre batches; cada import es independiente.

### Confirmación manual
- Al confirmar un match, se crea/actualiza `payer_aliases` (normalized_payer_name → client_id).
- Si el mismo pagador se confirma a otro cliente, se actualiza el alias y se registra en `alias_history` (si se implementa).
- La operación de confirmar es idempotente por (payment_id, client_id): si ya existe match confirmado, no se duplica.

## Manejo de errores

### Excel inválido
- `parseClientsExcel` / `parsePaymentsExcel` retornan `{ error: string }` si faltan columnas o hay datos inválidos.
- La API `/api/reconciliation/process` devuelve 400 con el mensaje de error.
- El cliente muestra toast con el error.

### Columnas faltantes
- Clientes: se busca "Apellido Nombres//Razón Social" (o variantes).
- Pagos: "Dato Opcional 1", "Dato Opcional 2", "Id Usuario", "Nro Tarjeta", "Importe", "Aplicada", "Observaciones".
- Si no se encuentra la columna, se retorna error descriptivo.

### Tipos erróneos
- `importe` se convierte a número; si falla, se usa 0.
- `id_usuario`, `nro_tarjeta` se tratan como string.
- Validación con Zod en el parseo cuando aplique.

### Firestore
- Las APIs usan Admin SDK (bypasea reglas).
- Errores de escritura se capturan y devuelven 500 con mensaje genérico.
- Los batches de Firestore se ejecutan con `batch().commit()`; fallo revierte todo el batch.

## Índices Firestore recomendados

```
recPayments: import_batch_id (ASC), created_at (DESC)
recMatches: import_batch_id (ASC)
recImportBatches: created_at (DESC)
recPayerAliases: normalized_payer_name (para lookup por alias)
```

Firestore crea índices automáticos para campos usados en `where` y `orderBy`. Si hay queries compuestas, crear índices compuestos en la consola de Firebase.
