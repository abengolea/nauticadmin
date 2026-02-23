# Conciliación de Pagos

## Descripción

Sistema unificado de conciliación en una sola página con dos flujos:

- **Excel / CSV**: Relaciones (Cuenta ↔ Pagador) + Pagos con mapeo de columnas
- **Formato banco**: Importar archivos Clientes + Pagos del banco, alias Pagador→Cliente

- **Archivo de relaciones**: Excel/CSV con columnas "AYB (Cuenta)" y "Pagador (Col G)"
- **Archivo de pagos**: Excel/CSV con columnas variables (mapeo manual)
- **Resultado**: Conciliados, A Revisar, Sin Conciliar

## Cómo correrlo

1. Iniciar el servidor: `npm run dev`
2. Ir a **Conciliación** en el menú (como school_admin)
3. Pestaña **Excel / CSV**:
   - **Paso 1**: Subir archivo de relaciones → Vista previa → Guardar
   - **Paso 2**: Subir archivo de pagos → Mapear columnas (Pagador, Monto, Fecha, Referencia) → Aplicar
   - Clic en **Conciliar**
   - Revisar resultados en las 3 pestañas
   - En "A Revisar": elegir cuenta y "Guardar regla"

## Cómo probarlo

### Tests unitarios

```bash
npm run test -- --run src/lib/reconciliacion-excel
```

### Archivos de prueba

**Relaciones** (relaciones.csv o .xlsx):
| AYB (Cuenta) | Pagador (Col G) |
|--------------|-----------------|
| A1-B1        | Rojas Maria Eugenia |
| A2-B2        | Moreno Hector |

**Pagos** (pagos.csv o .xlsx) - columnas según mapeo:
| Pagador | Monto | Fecha | Referencia |
|---------|-------|-------|------------|
| Rojas Maria Eugenia | 1000 | 2025-01-15 | |
| Moreno Hector | 500 | 2025-01-16 | A2 |

## Estructura del código

- `src/lib/reconciliacion-excel/`: normalización, matcher (Jaro-Winkler), parser, reconcile
- `src/components/reconciliacion/`: ImportRelations, ImportPayments, ColumnMapping, ReconciliationResults
- `src/app/dashboard/reconciliacion-excel/page.tsx`: página principal
- `src/app/api/reconciliacion-excel/`: relations, audit, save-rule

## Reglas de matching

- **Match exacto**: 1 cuenta para el pagador → MATCHED
- **Múltiples cuentas**: usa Referencia para desempatar; si no hay → REVIEW
- **Fuzzy (Jaro-Winkler)**:
  - ≥ 0.92 → MATCHED (auto-fuzzy)
  - 0.85–0.92 → REVIEW
  - < 0.85 → UNMATCHED

## Persistencia

- **Firestore**: `schools/{schoolId}/recExcelRelations`, `recExcelAudit`
- Las relaciones se cargan al abrir la página y al hacer "Cargar relaciones guardadas"
