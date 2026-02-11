/**
 * Tipos para el módulo de Notas (blog/news).
 */

export type PostStatus = "draft" | "published" | "archived";

export interface Post {
  id: string;
  schoolId: string;
  schoolSlug: string;
  schoolName: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImageUrl?: string;
  galleryUrls?: string[];
  tags?: string[];
  searchKeywords?: string;
  status: PostStatus;
  createdAt: Date;
  updatedAt: Date;
  createdByUid: string;
  createdByName: string;
  updatedByUid: string;
  updatedByName: string;
  publishedAt?: Date;
  publishedByUid?: string;
  publishedByName?: string;
}

/** Input para crear post (borrador). */
export interface CreatePostInput {
  schoolId: string;
  schoolSlug: string;
  schoolName: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImageUrl?: string;
  galleryUrls?: string[];
  tags?: string[];
}

/** Input para editar post (sin campos sensibles). */
export interface UpdatePostInput {
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  coverImageUrl?: string;
  galleryUrls?: string[];
  tags?: string[];
}
