# Módulo de Notas (Blog/News)

## Estructura de archivos

### Nuevos
- `src/lib/types/posts.ts` - Tipos Post, CreatePostInput, UpdatePostInput
- `src/lib/posts/slugify.ts` - slugify()
- `src/lib/posts/server.ts` - createPost, updatePost, publishPost, unpublishPost, archivePost, checkSlugUnique, listPosts, getPostBySlug, getPostById, getSchoolBySlug
- `src/lib/posts/permissions.ts` - canUserManagePosts, getSchoolsForUser
- `src/app/api/posts/route.ts` - GET (listar), POST (crear)
- `src/app/api/posts/check-slug/route.ts` - GET (verificar slug único)
- `src/app/api/posts/schools/route.ts` - GET (escuelas del usuario)
- `src/app/api/posts/upload-image/route.ts` - POST (subir imagen)
- `src/app/api/posts/[postId]/route.ts` - GET (obtener), PATCH (actualizar)
- `src/app/api/posts/[postId]/publish/route.ts` - POST
- `src/app/api/posts/[postId]/unpublish/route.ts` - POST
- `src/app/api/posts/[postId]/archive/route.ts` - POST
- `src/app/notas/page.tsx` - Feed global de notas
- `src/app/notas/layout.tsx` - Layout público
- `src/app/escuelas/layout.tsx` - Layout público escuelas
- `src/app/escuelas/[schoolSlug]/notas/page.tsx` - Feed por escuela
- `src/app/escuelas/[schoolSlug]/notas/[postSlug]/page.tsx` - Nota individual
- `src/app/dashboard/notas/page.tsx` - Panel admin listado
- `src/app/dashboard/notas/nueva/page.tsx` - Crear nota
- `src/app/dashboard/notas/[postId]/page.tsx` - Editar nota
- `src/components/notas/NotasFeed.tsx`, PostCard, TagList, LoadMore, PostContentRenderer, NotaForm, NotasAdminList
- `src/app/sitemap.ts` - Sitemap con notas publicadas

### Modificados
- `src/lib/types/index.ts` - export posts, School.slug, SchoolUser.role (editor, viewer)
- `src/lib/firebase-admin.ts` - getAdminStorage()
- `src/lib/auth-server.ts` - verifyIdToken retorna displayName
- `firestore.rules` - posts, isEditor, isViewer, isStaffOfSchool
- `storage.rules` - schools/{schoolId}/posts
- `firestore.indexes.json` - índices para posts
- `next.config.ts` - firebasestorage.googleapis.com en images
- `src/components/layout/SidebarNav.tsx` - ítem Notas
- `src/app/page.tsx` - link a Notas

## Índices Firestore

Ejecutar:
```bash
firebase deploy --only firestore:indexes
```

O crear manualmente en Firebase Console los índices para la colección `posts`:
- status ASC, publishedAt DESC, createdAt DESC
- schoolId ASC, status ASC, publishedAt DESC, createdAt DESC
- schoolId ASC, status ASC, updatedAt DESC, createdAt DESC
- schoolSlug ASC, slug ASC, status ASC

## Escuelas con slug

Para que las URLs `/escuelas/[schoolSlug]/notas` funcionen con slug legible, agregar el campo `slug` a los documentos en `schools`. Ejemplo:

```js
// En Firestore o script de migración
schools/docId: { ..., slug: "escuela-villa-crespo" }
```

Si no hay slug, se usa el ID del documento como fallback en la URL.

## Roles

- **superadmin**: gestiona todo
- **school_admin**: publica/edita/archiva notas de su escuela
- **coach**: crea/edita borradores de su escuela (no publica; debe aprobar school_admin)
- **editor**: crea/edita borradores de su escuela (no publica)
- **viewer**: solo lectura en panel

Para asignar editor o viewer, agregar en `schools/{schoolId}/users/{uid}` el campo `role: "editor"` o `role: "viewer"`.

## Sanitización Markdown

`react-markdown` por defecto no interpreta HTML crudo. Si en el futuro se permite HTML en el contenido, instalar `rehype-sanitize` y usarlo:

```tsx
import rehypeSanitize from "rehype-sanitize";
<ReactMarkdown rehypePlugins={[rehypeSanitize]}>{content}</ReactMarkdown>
```

## Tests sugeridos

### slugify (unit)
```ts
import { slugify } from "@/lib/posts/slugify";
expect(slugify("Jornada de Entrenamiento")).toBe("jornada-de-entrenamiento");
expect(slugify("")).toBe("post");
```

### Permisos (manual/integración)
- Verificar que school_admin puede publicar
- Verificar que editor no puede publicar
- Verificar que viewer solo ve el listado

## Checklist de verificación manual

- [ ] Crear borrador desde panel
- [ ] Editar borrador
- [ ] Vista previa Markdown
- [ ] Subir imagen destacada
- [ ] Publicar (solo admin/coach)
- [ ] Despublicar
- [ ] Archivar
- [ ] Ver nota pública en /escuelas/[slug]/notas/[postSlug]
- [ ] Feed global /notas
- [ ] Feed por escuela /escuelas/[slug]/notas
- [ ] Búsqueda por título/tags
- [ ] Cargar más (paginación)
- [ ] SEO: metadata, og:image, JSON-LD
- [ ] Sitemap incluye notas publicadas
- [ ] Editor no puede publicar
- [ ] Viewer solo ve listado
