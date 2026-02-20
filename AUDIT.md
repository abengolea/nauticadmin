# Auditoría: Código que no sirve para NauticAdmin

**Proyecto:** NauticAdmin (plataforma náutica)  
**Origen:** Escuela River (plataforma escuela de fútbol)  
**Fecha:** Relevamiento post-migración

---

## 1. CÓDIGO HUÉRFANO (no referenciado, se puede eliminar)

### 1.1 Componentes de evaluaciones deportivas
| Archivo | Motivo |
|---------|--------|
| `src/components/evaluations/EvaluationsTab.tsx` | Tab eliminada del perfil cliente |
| `src/components/evaluations/AddEvaluationSheet.tsx` | Tab eliminada |
| `src/components/evaluations/EvaluationDetailDisplay.tsx` | Usado solo por EvaluationsTab |
| `src/components/evaluations/EvaluationEvolutionCharts.tsx` | Usado solo por EvaluationsTab |

**Acción:** Eliminar carpeta `components/evaluations/` completa.

### 1.2 Logo River
| Archivo | Motivo |
|---------|--------|
| `src/components/icons/RiverPlateLogo.tsx` | Reemplazado por NauticAdminLogo; no se importa en ningún lado |

**Acción:** Eliminar. Si settings usa logo personalizado (localStorage), verificar antes.

### 1.3 CoachFeedback / EditCoachFeedbackDialog
| Archivo | Motivo |
|---------|--------|
| `src/components/players/EditCoachFeedbackDialog.tsx` | Concepto "entrenador" no aplica a náutica |
| `SummaryTab.tsx` (líneas 125-144) | Muestra EditCoachFeedbackDialog si `canEditCoachFeedback` |
| `players/[id]/page.tsx` | Pasa `canEditCoachFeedback={false}` — nunca se muestra |

**Acción:** Eliminar EditCoachFeedbackDialog y referencias. Opcional: reemplazar por "Notas admin" genéricas.

### 1.4 AI Flows huérfanos
| Archivo | Motivo |
|---------|--------|
| `src/ai/flows/improve-coach-comments.ts` | Solo usado por AddEvaluationSheet (eliminado) |
| `src/ai/flows/improve-mass-message.ts` | Usado por MassMessageForm (mensajes masivos a jugadores) — **revisar si aplica a clientes** |

**Acción:** `improve-coach-comments` eliminar. `improve-mass-message` mantener si se usan mensajes masivos a clientes.

---

## 2. ÍNDICES Y REGLAS FIRESTORE OBSOLETOS

### 2.1 firestore.indexes.json
| Índice | Colección | Motivo |
|--------|-----------|--------|
| posts (4 índices) | `posts` | Colección eliminada |
| physicalAssessments | `physicalAssessments` | Evaluaciones físicas eliminadas |
| evaluations | `evaluations` | Evaluaciones deportivas eliminadas del UI |

**Acción:** Eliminar índices de `posts`, `physicalAssessments`, `evaluations` si no se usan en otro lado.

### 2.2 firestore.rules
| Regla | Motivo |
|-------|--------|
| `match /posts/{postId}` | Colección posts eliminada |
| `match /schools/{id}/physicalAssessmentConfig/` | Evaluaciones físicas eliminadas |
| `match /schools/{id}/physicalAssessments/` | Evaluaciones físicas eliminadas |
| `match /schools/{id}/testTemplates/` | Tests físicos eliminados |
| `match /schools/{id}/evaluations/` | Evaluaciones deportivas eliminadas del UI |

**Acción:** Comentar o eliminar reglas de colecciones no usadas. Mantener si hay datos legacy que leer.

---

## 3. MODELOS Y TIPOS NO APLICABLES A NÁUTICA

### 3.1 Player (usado como Cliente)
Campos de dominio fútbol que no aplican a cliente náutica:

| Campo | Uso actual | Para náutica |
|-------|------------|--------------|
| `pie_dominante` | Lateralidad | No aplica |
| `posicion_preferida` | delantero, mediocampo, defensor, arquero | No aplica |
| `numero_camiseta` | Número de camiseta | No aplica |
| `talle_camiseta` | Talle | No aplica |
| `altura_cm`, `peso_kg`, `envergadura_cm` | Datos físicos deportivos | Opcional (documentación) |
| `coachFeedback` | Comentario entrenador | Reemplazar por "notas admin" o similar |
| `genero` | Categorías SUB | En náutica no hay categorías por edad |
| `tutorContact` | Tutor del jugador menor | Para cliente adulto: puede ser "contacto emergencia" |

### 3.2 Tipos Physical* en lib/types/index.ts
| Tipo | Uso |
|------|-----|
| PhysicalAssessmentTemplate | Evaluaciones físicas (eliminadas) |
| PhysicalAgeGroup, PhysicalTests*, PhysicalFieldDef | Evaluaciones físicas |
| PhysicalAssessmentConfig | Evaluaciones físicas |
| PhysicalAssessment | Evaluaciones físicas |

**Acción:** Deprecar o eliminar si no hay datos legacy. Si Firestore tiene datos, mantener tipos para lectura.

### 3.3 Evaluation
Tipo para evaluaciones deportivas (posición, comentarios entrenador, etc.). Ya no hay UI que lo use.

**Acción:** Mantener tipo si Firestore tiene datos. Eliminar imports en componentes que ya no lo usan.

---

## 4. PAGOS: CONCEPTOS ESCUELA

### 4.1 Cuotas por categoría (SUB-5 a SUB-18)
- `amountByCategory`, `registrationAmountByCategory` en PaymentConfig
- `getCategoryLabel` en utils (SUB-5 a SUB-18)
- `getAmountForCategory` en payments/db

**Para náutica:** Las categorías por edad no aplican. Un plan puede ser único o por tipo de embarcación/amarra.

### 4.2 Pago de ropa (clothing)
- `clothingAmount`, `clothingInstallments`, `ropa-1`, `ropa-2` en payments
- `clothing-pending` API, `getClothingPendingForPlayer`

**Para náutica:** No aplica a menos que se venda merchandising.

### 4.3 Inscripción (registration)
- `registrationAmount`, `registrationCancelsMonthFee`
- `period === 'inscripcion'`

**Para náutica:** Puede mapearse a "alta de cliente" o "derecho de amarra inicial".

---

## 5. RUTAS Y PÁGINAS A REVISAR

### 5.1 Asistencia (attendance)
- `/dashboard/attendance` — Asistencia a entrenamientos
- `schools/{id}/trainings`, `trainings/{id}/attendance`

**Para náutica:** No hay "entrenamientos". Podría reutilizarse para "registro de uso" o "check-in embarcación" si aplica.

### 5.2 Videoteca
- `/dashboard/record-video`, `PlayerVideoteca`
- `schools/{id}/playerVideos`

**Para náutica:** No aplica (videos de jugadores). Eliminar o repensar para "galería de embarcaciones" o similar.

### 5.3 Fichas médicas
- `/dashboard/medical-records`, `MedicalRecordField`

**Para náutica:** Puede servir para "documentación del cliente" (licencia, seguro, etc.).

### 5.4 Registro / Solicitudes
- `PendingPlayer`, `pendingPlayers`, `registrations`, `AccessRequest`
- Rol `player` en SchoolUser

**Para náutica:** Mantener flujo de "cliente pide acceso" → admin aprueba. Revisar textos.

### 5.5 Appointments (turnos)
- `/dashboard/appointments`, "Sacar turno"
- `appointments`, `appointmentConfig`

**Para náutica:** Útil para reservar amarra, mantenimiento, etc. **Mantener** y adaptar textos.

---

## 6. DOCUMENTACIÓN OBSOLETA

| Archivo | Motivo |
|---------|--------|
| `docs/notas-module.md` | Módulo notas eliminado |
| `docs/claude-consulta-evaluacion-form.md` | Evaluaciones eliminadas |
| `docs/instructivo-registro-jugadores-whatsapp.md` | Dominio jugadores/escuela |
| `docs/mensualidades-escuelas.md` | Referencias a escuelas |
| `docs/backend.json` | Puede tener schemas de posts, physicalAssessments |

**Acción:** Actualizar o eliminar docs obsoletos.

---

## 7. SCRIPTS

| Script | Uso |
|--------|-----|
| `scripts/simulate-electronic-payment.ts` | Simula pago MP; usa PLAYER_EMAIL, SCHOOL_ID, PLAYER_ID |
| `scripts/seed-support-flows.ts` | Seeds de support |
| `scripts/create-super-admin.ts` | Crear admin — **útil** |

**Acción:** Actualizar `simulate-electronic-payment` para usar `CLIENT_EMAIL` o similar si se usa.

---

## 8. ROLES Y PERMISOS

### 8.1 Rol "coach"
- Firestore: `isCoach`, `role == 'coach'`
- En náutica no hay "entrenador". Equivalente podría ser "operador" o "staff".

### 8.2 Rol "player"
- Para cliente que accede solo a su perfil.

**Acción:** Mantener lógica; el "player" es el cliente. Revisar nombres en UI.

---

## 9. RESUMEN DE ACCIONES RECOMENDADAS

| Prioridad | Acción |
|-----------|--------|
| Alta | Eliminar `components/evaluations/` (4 archivos) |
| Alta | Eliminar `RiverPlateLogo.tsx` si no se usa |
| Alta | Eliminar `ai/flows/improve-coach-comments.ts` |
| Alta | Eliminar `EditCoachFeedbackDialog` y referencias (SummaryTab, page) |
| Media | Limpiar `firestore.indexes.json` (posts, physicalAssessments, evaluations) |
| Media | Limpiar `firestore.rules` (posts, physicalAssessments, evaluations, testTemplates) |
| Media | Deprecar tipos Physical* en types/index.ts |
| Baja | Revisar `improve-mass-message` (¿mensajes a clientes?) |
| Baja | Actualizar docs obsoletos |
| Baja | Evaluar: videoteca, attendance — eliminar o repensar para náutica |
| Baja | Refactor Player → Cliente (campos, tipos) en etapas |

---

## 10. LO QUE SÍ SIRVE PARA NAUTICADMIN

- Auth (Firebase Auth, platformUsers, school users)
- Pagos (MercadoPago, PaymentIntent, Payment, PaymentConfig)
- Clientes (players collection) — con refactor de campos
- Náuticas (schools collection)
- Soporte (support center, tickets)
- Turnos (appointments)
- Fichas médicas (adaptable a documentación)
- Mensajes (MassMessageForm — si se usa para clientes)
- Registro de clientes (pendingPlayers, accessRequests)
- Platform fee / mensualidades
