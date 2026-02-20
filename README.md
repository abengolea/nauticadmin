# NauticAdmin

Plataforma web para administración de náuticas: clientes, embarcaciones, amarras/guardería, servicios y pagos online.

Desarrollada con Next.js y Firebase (Firestore, Auth, App Hosting).

## Desarrollo

**Variables de entorno:** Copiar `.env.example` a `.env.local` y rellenar los valores (Firebase, Genkit). No commitear credenciales.

```bash
npm install
npm run dev
```

Punto de entrada: `src/app/page.tsx`

## Staging y producción (Firebase App Hosting)

Las variables de Firebase están definidas en `apphosting.yaml`. La API key se incluye como variable; para secrets sensibles (Mercado Pago) se requiere plan Blaze.

## Scripts

- `npm run dev` — Desarrollo (puerto 9002)
- `npm run build` — Build de producción
- `npm run lint` — Linter
- `npm run typecheck` — Verificación TypeScript
