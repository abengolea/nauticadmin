import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Post } from "@/lib/types/posts";
import { TagList } from "./TagList";

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const href = `/escuelas/${post.schoolSlug}/notas/${post.slug}`;

  return (
    <article className="group rounded-lg border bg-card overflow-hidden transition-shadow hover:shadow-md">
      <Link href={href} className="block">
        {post.coverImageUrl ? (
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            <Image
              src={post.coverImageUrl}
              alt=""
              fill
              className="object-cover transition-transform group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        ) : (
          <div className="aspect-video w-full bg-muted" aria-hidden />
        )}
        <div className="p-4">
          <span className="text-xs font-medium text-muted-foreground">
            {post.schoolName}
          </span>
          <h2 className="mt-1 font-headline font-semibold text-lg line-clamp-2">
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
              {post.excerpt}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <time
              dateTime={post.publishedAt ? post.publishedAt.toISOString() : post.createdAt.toISOString()}
              className="text-xs text-muted-foreground"
            >
              {post.publishedAt
                ? format(post.publishedAt instanceof Date ? post.publishedAt : new Date(post.publishedAt), "d MMM yyyy", { locale: es })
                : format(post.createdAt instanceof Date ? post.createdAt : new Date(post.createdAt), "d MMM yyyy", { locale: es })}
            </time>
            {post.tags && post.tags.length > 0 && (
              <TagList tags={post.tags} size="sm" />
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
