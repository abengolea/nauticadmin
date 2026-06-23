# Configuración NotificasHub en nauticadmin

## Setup definitivo (HeartLink + Náutica)

### 1. Configurar tenant Náutica en NotificasHub (una vez)

```bash
npm run setup-nautica-definitivo -- --webhook "https://nauticadmin--nauticadmin.us-east4.hosted.app/api/whatsapp/incoming"
```

Ajustá la URL si tu nauticadmin tiene otra. El script muestra el `INTERNAL_SECRET` — copiarlo.

### 2. Configurar nauticadmin

En `.env.local`:

```
NOTIFICASHUB_URL=https://notificashub--studio-3864746689-59018.us-east4.hosted.app
INTERNAL_SECRET=<el que mostró el script>
```

En producción: `firebase apphosting:secrets:set INTERNAL_SECRET`

### 3. Agregar usuario a ambos tenants (NotificasHub)

```bash
npm run add-user-to-tenants -- 5493364645357 heartlink WZAf1Mw08Uq047wneIxI
```

---

## Detalle de variables

## Qué agregar a `.env.local`

### Caso A: Mismo proyecto Firebase

Si **nauticadmin** y **NotificasHub** usan el **mismo proyecto Firebase** (misma Firestore):

- No hace falta configurar variables extra.
- La sync de `user_memberships` escribe directo en Firestore.

### Caso B: Proyectos Firebase distintos (NotificasHub tiene su propia Firestore)

Si NotificasHub está en **otro proyecto Firebase**, agregá las credenciales del service account de NotificasHub:

```env
NOTIFICASHUB_PROJECT_ID=studio-3864746689-59018
NOTIFICASHUB_CLIENT_EMAIL=firebase-adminsdk-xxx@studio-3864746689-59018.iam.gserviceaccount.com
NOTIFICASHUB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

- **NOTIFICASHUB_PRIVATE_KEY**: La clave privada del JSON del service account. En `.env` usá `\n` literales (no saltos de línea reales). Entre comillas.
- ⚠️ **No duplicar** `NOTIFICASHUB_CLIENT_EMAIL` (solo una vez).

Opcional:

```env
NOTIFICASHUB_URL=https://notificashub--xxx.hosted.app
INTERNAL_SECRET=heartlink_internal_2026
```

### Caso C: nauticadmin recibe webhooks y responde por WhatsApp

Cuando el usuario elige Náutica en WhatsApp:
1. NotificasHub reenvía a `webhookUrl` (nauticadmin `/api/whatsapp/incoming`)
2. NauticAdmin procesa y responde llamando a `NOTIFICASHUB_URL/api/whatsapp/send`
3. El `internalSecret` del tenant debe coincidir con `INTERNAL_SECRET` en nauticadmin

Ver: `docs/WHATSAPP-NOTIFICASHUB-INTEGRACION.md`

---

## Resumen para .env.local

```env
# === NotificasHub (proyecto distinto) ===
NOTIFICASHUB_PROJECT_ID=studio-3864746689-59018
NOTIFICASHUB_CLIENT_EMAIL=firebase-adminsdk-xxx@....iam.gserviceaccount.com
NOTIFICASHUB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
# Para responder por WhatsApp (obligatorio si usás incoming):
NOTIFICASHUB_URL=https://notificashub--xxx.hosted.app
INTERNAL_SECRET=tu-secret  # El que devuelve setup-tenant-nautica
```

---

## Producción (Firebase App Hosting)

Las variables están en `apphosting.yaml` como **secrets**. Configurarlas con:

```bash
firebase apphosting:secrets:set NOTIFICASHUB_PROJECT_ID
firebase apphosting:secrets:set NOTIFICASHUB_CLIENT_EMAIL
firebase apphosting:secrets:set NOTIFICASHUB_PRIVATE_KEY
```

En cada comando, pegá el valor cuando lo pida y respondé **Yes** al grant access. Para `NOTIFICASHUB_PRIVATE_KEY`, pegá la clave completa (con `\n` literales o saltos reales según el formato que uses).

Después del próximo deploy, la sync API y el script usarán NotificasHub en producción.

---

## Registro automático de teléfonos

Cuando configurás NOTIFICASHUB_* correctamente:

- **Al crear o editar un cliente** con teléfono en tutorContact, nauticadmin registra automáticamente ese número en `user_memberships` de NotificasHub. No hace falta hacer nada extra.
- **"Sincronizar WhatsApp"** en Gestionar Náutica → Clientes actualiza todos los teléfonos de una vez (útil si agregaste muchos clientes antes de configurar).

Sin NOTIFICASHUB_* configurados, la sync escribe en el Firestore de nauticadmin y NotificasHub nunca ve los docs (el botón devuelve error 503).

---

## Cómo verificar

1. Con las vars configuradas, ejecutá:
   ```
   SCHOOL_ID=tu-school-id npx tsx scripts/seed-whatsapp-test-phone.ts
   ```
2. Si imprime "Escribiendo en Firestore de NotificasHub" y termina sin error, la conexión funciona.
3. Revisá en Firebase Console de NotificasHub que exista `user_memberships/5493364645357`.
