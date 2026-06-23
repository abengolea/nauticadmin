# Brief: Sistema de Conciliación — Estado actual y mejoras propuestas

**Para otra IA:** Este documento resume lo implementado y sugiere simplificaciones y mejoras.

---

## 1. Estado actual: dos flujos en una página

Ruta: `/dashboard/reconciliation` (una sola página, dos pestañas).

### Pestaña "Excel / CSV"

| Paso | Qué hace | Persistencia |
|------|----------|--------------|
| 1. Relaciones | Sube Excel/CSV con columnas AYB (Cuenta) + Pagador. Normaliza y guarda. | Firestore: `recExcelRelations` |
| 2. Pagos | Sube Excel/CSV de pagos. Mapeo de columnas (Pagador, Monto, Fecha, Referencia). | **Solo en memoria** |
| 3. Conciliar | Matching (exacto + fuzzy Jaro-Winkler). Resultados: MATCHED / REVIEW / UNMATCHED. | Audit en `recExcelAudit` |
| 4. A Revisar | Selección manual de cuenta → "Guardar regla" | Nueva relación en `recExcelRelations` |

**Limitación:** Los pagos se concilian en memoria. No se persisten ni se actualizan pagos reales del sistema.

### Pestaña "Formato banco"

| Paso | Qué hace | Persistencia |
|------|----------|--------------|
| 1. Importar | Sube 2 Excel: Clientes + Pagos del banco. API `/api/reconciliation/process`. | `recClients`, `recPayments`, `recMatches`, `recImportBatches` |
| 2. Alias | ImportAliasesFromExcel: Pagador → Cliente (jugador). | `recPendingPayerAliases` → `recPayerAliases` |
| 3. Revisar | ReconciliationReview: Auto-imputados, Revisar, Sin match, Conflictos. Confirmar/rechazar. | `recPayments.match_status`, `recMatches`, `recPayerAliases` |

**Limitación:** Los pagos están en `recPayments`, no en la colección principal `payments` (Mercado Pago, manual, etc.). No hay integración automática con el sistema de cobranza.

---

## 2. Colecciones Firestore relevantes

| Colección | Uso |
|-----------|-----|
| `schools/{id}/recClients` | Clientes del Excel (formato banco) |
| `schools/{id}/recPayments` | Pagos importados del banco |
| `schools/{id}/recMatches` | Matches pagos↔clientes |
| `schools/{id}/recPayerAliases` | Alias Pagador → client_id o player_id |
| `schools/{id}/recPendingPayerAliases` | Alias pendientes de asignar |
| `schools/{id}/recExcelRelations` | Relaciones Cuenta ↔ Pagador (flujo Excel) |
| `schools/{id}/recExcelAudit` | Log de conciliación Excel |
| `payments` (global) | Pagos reales del sistema (Mercado Pago, manual) |

---

## 3. Mejoras propuestas

### 3.1 Simplificar a un solo concepto

- Unificar `recExcelRelations` y `recPayerAliases` en un único modelo de relaciones: **Pagador → Cuenta/Cliente**.
- Un solo flujo de importación que acepte distintos formatos (Excel banco, Excel genérico con mapeo).

### 3.2 Conciliar clientes nuevos de forma incremental

- Permitir agregar relaciones sin reimportar todo.
- UI para "Agregar relación" manual (Pagador + Cuenta/Cliente).
- Al guardar una regla manual, que se use en futuras conciliaciones.

### 3.3 Conciliación manual completa

- En "A Revisar" y "Sin Conciliar": poder asignar cuenta/cliente manualmente.
- Opción "Crear cliente nuevo" si no existe.
- Guardar la decisión como regla para próximas importaciones.

### 3.4 Actualizar pagos tras conciliar

- Cuando un pago se concilia (MATCHED o confirmado manual):
  - **Opción A:** Crear/actualizar documento en `payments` vinculado al player/cliente.
  - **Opción B:** Mantener `recPayments` como fuente de verdad y exponer un reporte/export.
  - **Opción C:** Sincronizar con el sistema de cobranza existente (ver `payments`, `Player`, etc.).

### 3.5 Reconciliación incremental

- Permitir subir nuevos pagos sin reimportar relaciones.
- Reutilizar relaciones ya guardadas.
- Marcar pagos ya conciliados para no reprocesarlos.

### 3.6 UX

- Un solo flujo paso a paso (wizard) en lugar de dos pestañas.
- Indicadores claros: relaciones cargadas, pagos pendientes, resultados.
- Export de resultados (Excel/CSV) con estado de conciliación.

---

## 4. Archivos clave

```
src/app/dashboard/reconciliation/page.tsx     # Página unificada
src/components/reconciliacion/                # ImportRelations, ImportPayments, ColumnMapping, ReconciliationResults
src/components/reconciliation/                # ReconciliationImport, ReconciliationReview
src/components/payments/ImportAliasesFromExcel.tsx
src/lib/reconciliacion-excel/                 # normalize, matcher, parser, reconcile
src/lib/reconciliation/                       # normalize, scoring, matching, parse-excel
src/app/api/reconciliation/                   # process, confirm, list, pending-aliases, confirm-pending-alias
src/app/api/reconciliacion-excel/             # relations, audit, save-rule
```

---

## 5. Preguntas abiertas

1. ¿Los pagos conciliados deben crear registros en `payments` (sistema de cobranza)?
2. ¿`recClients` debe mapear a `players` (clientes de la náutica)?
3. ¿Unificar recExcelRelations con recPayerAliases o mantener ambos con usos distintos?
4. ¿Flujo preferido: wizard único o mantener dos pestañas (Excel vs banco)?

---

## 6. Cómo probar

```bash
npm run dev
# Ir a Conciliación (como school_admin)
# Pestaña Excel: subir relaciones, pagos, conciliar
# Pestaña Formato banco: subir clientes + pagos, revisar
```

Tests: `npm run test -- --run src/lib/reconciliacion-excel`
