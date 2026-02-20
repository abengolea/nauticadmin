# PLAN: Migración Escuela River → NauticAdmin

**Objetivo:** Convertir la plataforma de administración de escuela de fútbol en una plataforma para administrar una náutica (clientes, embarcaciones, amarras, servicios, pagos online).

**Condición:** No romper lo existente. Cambios ordenados con commits claros.

---

## 1. RELEVAMIENTO INICIAL

### 1.1 Framework y Stack

| Componente | Versión/Detalle |
|------------|-----------------|
| **Framework** | Next.js 15.5.9 (App Router) |
| **React** | 19.2.1 |
| **TypeScript** | ^5 |
| **UI** | Radix UI, Tailwind CSS, shadcn/ui (componentes en `src/components/ui/`), Lucide icons |
| **Formularios** | react-hook-form + @hookform/resolvers + zod |
| **Backend** | Firebase (Firestore, Auth, Storage) + firebase-admin (solo servidor) |
| **Pagos** | MercadoPago (Checkout Pro, OAuth por escuela). DLocal: stub preparado, no implementado |
| **AI** | Genkit (flows para comentarios, mensajes, evaluaciones físicas) |

### 1.2 Estructura de Rutas (App Router)

```
src/app/
├── page.tsx                    # Landing pública
├── layout.tsx                  # Root layout (metadata: "Escuelas River SN")
├── notas/                      # Notas públicas
├── escuelas/[schoolSlug]/notas/ # Notas por escuela
├── auth/
│   ├── login/
│   ├── registro/               # Registro web jugador
│   ├── registro/verificar/
│   ├── signup/
│   └── pending-approval/
├── dashboard/
│   ├── page.tsx                # Panel principal
│   ├── layout.tsx
│   ├── players/                # Jugadores (CRUD)
│   ├── attendance/             # Asistencia
│   ├── medical-records/        # Fichas médicas
│   ├── registrations/          # Solicitudes de alta
│   ├── physical-assessments-config/
│   ├── record-video/           # Videoteca
│   ├── support/                # Centro de soporte
│   ├── notas/                  # Notas admin
│   ├── messages/               # Mensajes
│   ├── payments/               # Pagos (checkout, test)
│   ├── settings/
│   ├── schools/[schoolId]/     # Gestionar escuela
│   └── admin/                  # Super admin (mensualidades, config, audit, etc.)
└── api/
    ├── payments/
    │   ├── intent/             # POST: crear intención de pago
    │   ├── webhook/mercadopago/
    │   ├── config/            # Config cuotas
    │   ├── delinquents/
    │   ├── manual/             # Marcar pago manual
    │   ├── me/                 # Estado pagos del jugador
    │   └── ...
    ├── players/               # update, archive, medical-record, status, etc.
    ├── posts/
    ├── registrations/
    ├── platform-fee/
    └── admin/
```

### 1.3 Modelos Principales (Firestore)

| Colección | Tipo | Descripción |
|-----------|------|-------------|
| `platformUsers` | PlatformUser | Super admins globales |
| `platformConfig` | PlatformConfig | Config global (mantenimiento, registro, etc.) |
| `schools` | School | Escuelas (slug, ciudad, etc.) |
| `schools/{id}/users` | SchoolUser | Usuarios por escuela (admin, coach, editor, viewer, player) |
| `schools/{id}/players` | Player | Jugadores (nombre, tutor, fecha nacimiento, etc.) |
| `schools/{id}/pendingPlayers` | PendingPlayer | Registros pendientes de aprobación |
| `schools/{id}/evaluations` | Evaluation | Evaluaciones deportivas |
| `schools/{id}/physicalAssessments` | PhysicalAssessment | Evaluaciones físicas |
| `schools/{id}/playerVideos` | PlayerVideo | Videoteca |
| `schools/{id}/trainings` | Training | Entrenamientos |
| `schools/{id}/trainings/{id}/attendance` | Attendance | Asistencia |
| `schools/{id}/paymentConfig` | PaymentConfig | Cuotas, mora, inscripción |
| `schools/{id}/mercadopagoConnection` | MercadoPagoConnection | OAuth MP |
| `payments` | Payment | Pagos (playerId, schoolId, period, status, provider) |
| `paymentIntents` | PaymentIntent | Intenciones de pago (checkout) |
| `posts` | Post | Notas/blog |
| `playerLogins` | - | email → schoolId + playerId (login jugador) |
| `accessRequests` | AccessRequest | Solicitudes de acceso |
| `supportFlows`, `supportTickets`, etc. | - | Centro de soporte |

### 1.4 Auth

- **Firebase Auth:** Email/password, tokens JWT.
- **auth-server.ts:** `verifyIdToken`, `verifySuperAdmin`, `isSchoolAdminOrSuperAdmin` (TODO: consulta Firestore).
- **Roles:** `super_admin`, `school_admin`, `coach`, `editor`, `viewer`, `player`.
- **Firestore rules:** `platformUsers`, `schools/{id}/users`, `schools/{id}/players` con validación por rol.
- **Nota:** No hay contraseñas planas; el auth es correcto con Firebase Auth.

### 1.5 Pagos (Lógica Actual)

| Ubicación | Función |
|-----------|---------|
| `src/lib/payments/mercadopago-checkout.ts` | Crear preferencia MP (Checkout Pro). Títulos hardcodeados "Escuela River". |
| `src/lib/payments/db.ts` | CRUD Firestore: `payments`, `paymentIntents`, `paymentConfig`, `mercadopagoConnection`. |
| `src/lib/payments/db.ts` | `computeDelinquents`, `getExpectedAmountForPeriod`, `createPayment`, etc. |
| `src/app/api/payments/webhook/mercadopago/route.ts` | Webhook GET/POST: recibe topic=payment, consulta MP, crea `Payment` con status approved, `updatePlayerStatus`, envía email. |
| `src/app/api/payments/intent/route.ts` | POST: crea PaymentIntent con `createPaymentIntentWithProvider`. |
| `provider-stub.ts` | MercadoPago: usa `createMercadoPagoPreference`. DLocal: stub. |

**Estado:** MercadoPago funcional; DLocal solo stub. Pagos: `playerId`, `schoolId`, `period` (YYYY-MM, inscripcion, ropa-N). `Payment.status`: pending/approved/rejected/refunded.

### 1.6 Referencias a Dominio "Escuela River"

| Archivo | Referencias |
|---------|-------------|
| `package.json` | `"name": "escuelariver"` |
| `README.md` | "Escuela River App", "jugadores de escuelas de fútbol" |
| `src/app/layout.tsx` | metadata: "Escuelas River SN", "Sistema Integral de Seguimiento de Jugadores" |
| `src/app/page.tsx` | "ESCUELAS RIVER SN", "Registrarme como jugador", "Gestiona el Futuro del Fútbol", imágenes hero |
| `src/components/icons/RiverPlateLogo.tsx` | Logo River |
| `src/components/layout/SidebarNav.tsx` | "ESCUELAS RIVER SN", RiverPlateLogo |
| `src/lib/payments/mercadopago-checkout.ts` | Títulos: "Escuela River" en cuota/inscripción/ropa |
| `apphosting.yaml` | `NEXT_PUBLIC_APP_URL`: escuelariver--lexflow-consultas.us-east4.hosted.app |

**Grep:** ~100+ archivos con "jugador", "escuela", "River" en comentarios, labels, tipos, rutas.

---

## 2. MAPEO ENTIDADES: Escuela → Náutica

| Escuela (actual) | Náutica (propuesto) | Estrategia |
|------------------|----------------------|----------------|
| **School** | Náutica/Club | Reutilizar: renombrar concepto o mantener "school" como tenant interno |
| **Player** | **Cliente** (titular) | Nuevo modelo `Cliente`: nombre, documento, email, teléfono, dirección. Player no mapea 1:1 (jugador tiene tutor, fecha nacimiento; cliente es titular). |
| **Player** (alternativa) | **Embarcación** | No: embarcación es un recurso, no un cliente. |
| **Tutor** (Player.tutorContact) | Parte de Cliente | Cliente tiene contacto directo. |
| **Cuota mensual** (Payment period YYYY-MM) | Plan mensual Amarra/Guardería | Reutilizar Payment con period tipo "amarra-YYYY-MM" o nueva colección `amarras`. |
| **Payment** | Factura/Orden de pago | Extender: `Payment` con items, total, referencia proveedor. O crear `PaymentOrder` (PENDING/PAID). |
| **Comunicaciones** (posts, messages) | Notificaciones al cliente | Reutilizar `posts` como "Noticias" y mensajes. |
| **PhysicalAssessment** | Servicio/Trabajo (mantenimiento) | No directo. Crear `Servicio` con tipo (mantenimiento, reparación, guardería). |
| **Training + Attendance** | No aplica | Deprecar o no migrar en Fase 1. |
| **Evaluation** | No aplica | Deprecar o no migrar en Fase 1. |
| **MedicalRecord** | Documentación embarcación | Opcional: adaptar para documentos de embarcación. |
| **PlayerVideo** | No aplica | Deprecar. |

### Entidades Náutica Mínimas (nuevas)

```
Cliente (titular)
  - id, nombre, documento, email, teléfono, dirección
  - createdAt, createdBy

Embarcación
  - id, nombre, matrícula, tipo, eslora, clienteId
  - schoolId (náutica)
  - createdAt, createdBy

Servicio/Trabajo
  - id, tipo (mantenimiento | reparación | guardería), descripción, estado
  - embarcaciónId, monto, fechas
  - schoolId
  - createdAt, createdBy

Amarra/Guardería
  - id, plan mensual, estado, embarcaciónId
  - schoolId
  - createdAt, createdBy

Factura/Orden de pago
  - id, items[], total, estado (PENDING | PAID), providerPaymentId
  - clienteId o embarcaciónId (según contexto)
  - schoolId
  - createdAt, createdBy
```

---

## 3. PLAN POR FASES

### Fase 0: Relevamiento (COMPLETADO)

- [x] Identificar framework, rutas, modelos, auth, pagos
- [x] Documentar en PLAN.md
- [x] Mapear entidades

**Esfuerzo:** 0 (ya hecho).

---

### Fase 1: Rebranding + Neutralización de Dominio

**Objetivo:** Cambiar textos, labels, títulos, nombres visibles de "Escuela River" a "NauticAdmin" sin tocar lógica crítica.

**Tareas:**

1. **package.json:** `"name": "nauticadmin"`.
2. **README.md:** Actualizar a NauticAdmin, plataforma náutica.
3. **layout.tsx:** metadata.title = "NauticAdmin", description = "Administración de náutica".
4. **page.tsx (landing):** Reemplazar "ESCUELAS RIVER SN" por "NauticAdmin"; textos genéricos náutica; botón "Registrarme como cliente" (o placeholder).
5. **SidebarNav.tsx:** Logo y título "NauticAdmin" (placeholder si no hay logo).
6. **RiverPlateLogo:** Crear `NauticAdminLogo` placeholder o SVG genérico.
7. **mercadopago-checkout.ts:** Títulos de preferencia: "NauticAdmin" en lugar de "Escuela River".
8. **assets:** Favicon, logo. Reemplazar `/images/hero-chicos-futbol.png.jpeg` y `river_foto2.jpeg` por placeholders o imágenes náuticas.

**Riesgos:** Bajo. Solo UI. Mantener rutas y colecciones iguales.

**Archivos clave:** `package.json`, `README.md`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/layout/SidebarNav.tsx`, `src/components/icons/RiverPlateLogo.tsx` (o nuevo), `src/lib/payments/mercadopago-checkout.ts`.

**Esfuerzo:** 0.5–1 día.

---

### Fase 2: Modelo de Negocio Náutica

**Objetivo:** Definir entidades y colecciones nuevas sin tocar las existentes.

**Tareas:**

1. **Types:** Crear `src/lib/types/nautica.ts` con:
   - `Cliente`, `Embarcacion`, `Servicio`, `Amarra`, `PaymentOrder` (o extender Payment).
2. **Firestore:** Nuevas colecciones:
   - `schools/{id}/clientes`
   - `schools/{id}/embarcaciones`
   - `schools/{id}/servicios`
   - `schools/{id}/amarras`
   - `paymentOrders` (o reutilizar `payments` con schema extendido).
3. **Firestore rules:** Agregar reglas para nuevas colecciones (mismo patrón que players).
4. **Mappers/adaptadores:** Si se mantiene UI viejo temporalmente, crear `clienteToPlayer` o similar para compatibilidad (opcional).

**Riesgos:** Medio. Firestore rules deben probarse. Índices si hay queries compuestas.

**Esfuerzo:** 1–2 días.

---

### Fase 3: Migración Técnica por Etapas

**Objetivo:** Nuevas pantallas mínimas, reutilizando componentes UI.

**Tareas:**

1. **Dashboard Náutica:** Nueva ruta `/dashboard/nautica` o adaptar `/dashboard` con vista condicional (si es náutica vs escuela).
2. **Clientes:** CRUD en `/dashboard/clientes` (lista, alta, edición). Reutilizar `PlayerTable`, `AddPlayerForm` como base (adaptar campos).
3. **Embarcaciones:** CRUD en `/dashboard/embarcaciones` (lista, alta, edición). Selector de cliente.
4. **Servicios/Trabajos:** Lista + alta en `/dashboard/servicios`. Reutilizar formularios, tablas.
5. **Pagos:** Pantalla `/dashboard/pagos` (generar orden, link de pago). Reutilizar `PaymentsTab`, `PaymentConfigTab` adaptados.
6. **Navegación:** Actualizar SidebarNav con ítems de náutica (Clientes, Embarcaciones, Servicios, Pagos) en lugar de Jugadores, Asistencia, etc., o mostrar según tipo de tenant.

**Riesgos:** Medio-alto. Muchos componentes asumen Player. Estrategia: crear componentes nuevos que importen tipos náuticos; no modificar masivamente los existentes hasta tener cobertura.

**Esfuerzo:** 3–5 días.

---

### Fase 4: Pagos Online

**Objetivo:** Orden de pago con estado PENDING/PAID, webhook, link de pago.

**Estado actual:** MercadoPago ya implementado para `playerId` + `period`. Para náutica: crear `PaymentOrder` con `clienteId` o `embarcacionId`, `items`, `total`, `status`.

**Tareas:**

1. **PaymentOrder:** Extender o crear `paymentOrders` con: `id`, `clienteId`, `schoolId`, `items`, `total`, `status` (PENDING | PAID), `providerPaymentId`, `providerPreferenceId`, `createdAt`, `updatedAt`.
2. **API:** `POST /api/payments/order` — crea PaymentOrder PENDING, llama `createMercadoPagoPreference` con external_reference = `schoolId|orderId` (o `clienteId|orderId`).
3. **Webhook:** Adaptar `webhook/mercadopago` para: si `external_reference` contiene orderId, actualizar PaymentOrder a PAID y guardar `providerPaymentId`.
4. **Variables de entorno:** `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET` ya existen. No exponer en cliente.
5. **DLocal:** Mantener como opción futura (stub ya existe).

**Riesgos:** Medio. Webhook debe procesar ambos formatos (playerId|period y orderId) durante transición.

**Esfuerzo:** 1–2 días.

---

### Fase 5: Calidad

**Tareas:**

1. **Imports/paths:** Revisar imports rotos tras refactors.
2. **Lint:** `npm run lint` sin errores.
3. **Typecheck:** `tsc --noEmit` sin errores.
4. **Validaciones:** Zod en schemas de nuevos endpoints (ya existe en payments).
5. **Seeds/mock:** Script para poblar `clientes`, `embarcaciones`, `servicios` de prueba.
6. **Env vars:** Consolidar en `.env.example`; documentar en README.

**Esfuerzo:** 0.5–1 día.

---

## 4. RIESGOS Y ESTRATEGIA DE REFACTOR

### Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Big bang rename rompe todo | Fases incrementales. No renombrar Player/PlayerId en Firestore hasta tener migración de datos. |
| Firebase Admin en cliente | Ya está correcto: `firebase-admin` solo en API routes y server actions. |
| Auth despareja | No hay contraseñas planas; Firebase Auth está bien. |
| Webhook de MP recibe formato viejo | Mantener compatibilidad: si external_reference tiene `playerId|period`, procesar como hoy; si tiene `orderId`, procesar PaymentOrder. |
| Colecciones multi-tenant | `schools/{id}/...` ya soporta multi-escuela. Náutica = 1 school por ahora. |
| Genkit/AI flows | Dependen de Player, evaluaciones. En Fase 3: deshabilitar o adaptar para Cliente. |

### Estrategia de Refactor

1. **No borrar:** Deprecar en fases. Marcar con `@deprecated` en JSDoc. Crear nuevos módulos en paralelo.
2. **Commits:** Un commit por fase (o sub-fase). Mensajes claros: `feat(rebrand): NauticAdmin branding`, `feat(nautica): add Cliente and Embarcacion models`.
3. **Tests:** Si hay tests, mantenerlos. Agregar tests para nuevos endpoints.
4. **Feature flags:** Opcional: `NEXT_PUBLIC_NAUTICA_MODE=true` para mostrar menú náutica vs escuela hasta tener paridad.

---

## 5. ARCHIVOS CLAVE IDENTIFICADOS

### Rutas

- `src/app/page.tsx` — Landing
- `src/app/layout.tsx` — Root layout
- `src/app/dashboard/layout.tsx` — Dashboard layout
- `src/app/dashboard/players/` — Jugadores (CRUD)
- `src/app/dashboard/payments/` — Pagos

### Modelos

- `src/lib/types/index.ts` — Tipos principales
- `src/lib/types/payments.ts` — Payment, PaymentIntent, PaymentConfig
- `src/lib/types/posts.ts` — Post

### Auth

- `src/lib/auth-server.ts` — Verificación servidor
- `src/lib/firebase-admin.ts` — Admin SDK
- `src/firebase/auth/use-user-profile.tsx` — Perfil usuario

### Pagos

- `src/lib/payments/mercadopago-checkout.ts` — Crear preferencia
- `src/lib/payments/db.ts` — Acceso Firestore pagos
- `src/lib/payments/db.ts` — computeDelinquents, createPayment
- `src/app/api/payments/webhook/mercadopago/route.ts` — Webhook
- `src/app/api/payments/intent/route.ts` — Crear intención

### UI

- `src/components/layout/SidebarNav.tsx` — Navegación
- `src/components/layout/Header.tsx` — Header
- `src/components/icons/RiverPlateLogo.tsx` — Logo
- `src/components/players/` — Componentes jugadores
- `src/components/payments/` — Componentes pagos

### Config

- `firestore.rules` — Reglas Firestore
- `apphosting.yaml` — Variables Firebase App Hosting
- `.env.example` — No existe; crear documentando vars necesarias

---

## 6. ESTIMACIÓN DE ESFUERZO TOTAL

| Fase | Esfuerzo | Dependencias |
|------|----------|--------------|
| 0 | 0 | - |
| 1 | 0.5–1 día | - |
| 2 | 1–2 días | - |
| 3 | 3–5 días | Fase 2 |
| 4 | 1–2 días | Fase 2, 3 |
| 5 | 0.5–1 día | Todas |

**Total: 6–11 días** (estimación).

---

## 7. PRÓXIMOS PASOS

1. Confirmar plan con stakeholders.
2. Ejecutar Fase 1 (rebranding) sin tocar lógica.
3. Commit: `feat(rebrand): NauticAdmin branding, neutralizar Escuela River`.
4. Continuar con Fase 2 en siguiente iteración.
