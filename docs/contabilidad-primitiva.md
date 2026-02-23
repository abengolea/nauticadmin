# Contabilidad primitiva mes a mes / año a año

## Objetivo

Mostrar ingresos efectivos vs gastos por período (mes, año) para tener una visión contable básica de la náutica.

---

## Fuentes de datos actuales

### Ingresos (ya existen)
| Fuente | Colección | Filtro | Campo monto |
|--------|-----------|--------|-------------|
| Cuotas mensuales | `payments` | status=approved, paymentType=monthly | amount |

**Nota:** Inscripción y venta de ropa no existen en esta app.

**Fecha a usar:** `paidAt` (cuando se cobró) o `createdAt` si no hay paidAt.

### Gastos (ya existen)
| Fuente | Colección | Filtro | Campo monto |
|--------|-----------|--------|-------------|
| Facturas | `schools/{schoolId}/expenses` | status in (confirmed, paid) | amounts.total |

**Fecha a usar:** `invoice.issueDate` o `createdAt`.

### Ingresos a agregar (ventas de hielo, etc.)
- **Propuesta:** Colección `schools/{schoolId}/incomeEntries` para ingresos manuales (ventas de hielo, otros).
- Campos: `date`, `amount`, `currency`, `concept` (ej: "Venta hielo"), `category` (opcional).
- Se suman en la categoría `otros` del resumen.

---

## Diseño propuesto

### 1. API: GET /api/accounting/summary

```
GET /api/accounting/summary?schoolId=X&year=2025&month=3
```

**Respuesta:**
```json
{
  "period": { "year": 2025, "month": 3 },
  "income": {
    "total": 450000,
    "currency": "ARS",
    "byCategory": {
      "cuotas": 380000,
      "otros": 70000
    }
  },
  "expenses": {
    "total": 120000,
    "count": 8,
    "currency": "ARS"
  },
  "result": 330000
}
```

- `cuotas`: cobros de cuotas mensuales (payments aprobados).
- `otros`: ingresos manuales (ventas de hielo, etc.) desde incomeEntries.

Sin `month`: resumen anual (suma de todos los meses del año).

### 2. Página: /dashboard/accounting (o Contabilidad)

- **Selector:** Año (dropdown) + Mes (dropdown u "Anual").
- **Cards:** Ingresos totales | Gastos totales | Resultado (verde/rojo).
- **Desglose:** Tabla o lista por categoría de ingreso.
- **Link:** "Ver detalle" → pagos del período, gastos del período.

### 3. Ingresos manuales (ventas de hielo)

- **Colección:** `schools/{schoolId}/incomeEntries`
- **Documento:** `{ date, amount, currency, concept, category?, createdAt }`
- **UI:** Formulario simple "Cargar ingreso" (fecha, monto, concepto).
- **Categorías sugeridas:** "Venta hielo", "Otros".

---

## Orden de implementación sugerido

1. **Fase 1 (MVP):** API + página con datos actuales (pagos + gastos). Sin ingresos manuales.
2. **Fase 2:** Colección incomeEntries + formulario para cargar ventas de hielo y otros.
3. **Fase 3 (opcional):** Gráficos, exportar a Excel, comparativa año anterior.

---

## Consideraciones

- **Moneda:** Por ahora asumir ARS. Si hay USD, convertir o mostrar por separado.
- **Índices Firestore:** Los pagos están en colección global; filtrar por schoolId + rango de fechas puede requerir muchas lecturas. Considerar agregar índice compuesto o cache.
- **Ventas de hielo:** Si se cobran por Mercado Pago u otro medio, podrían ir a `payments` con paymentType nuevo (`ice` o `other`). La colección `incomeEntries` es para ingresos en efectivo/manuales.
