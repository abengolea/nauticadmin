"use client";

import { useState } from "react";
import { PostCard } from "./PostCard";
import { LoadMore } from "./LoadMore";
import type { Post } from "@/lib/types/posts";

interface NotasFeedProps {
  initialPosts: Post[];
  initialCursor: string | null;
  schoolSlug?: string;
}

export function NotasFeed({ initialPosts, initialCursor, schoolSlug }: NotasFeedProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: "published",
        limit: "12",
        cursor,
      });
      if (schoolSlug) params.set("schoolSlug", schoolSlug);
      if (search) params.set("search", search);
      const res = await fetch(`/api/posts?${params}`);
      if (!res.ok) throw new Error("Error al cargar");
      const data = await res.json();
      setPosts((prev) => [...prev, ...data.posts]);
      setCursor(data.nextCursor);
    } catch {
      // Error silencioso; el usuario puede reintentar
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: "published",
        limit: "24",
      });
      if (schoolSlug) params.set("schoolSlug", schoolSlug);
      if (search) params.set("search", search);
      const res = await fetch(`/api/posts?${params}`);
      if (!res.ok) throw new Error("Error al buscar");
      const data = await res.json();
      setPosts(data.posts);
      setCursor(data.nextCursor);
    } catch {
      setPosts([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="search"
          placeholder="Buscar por título o etiquetas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Buscar notas"
        />
        <button
          type="button"
          onClick={handleSearch}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Buscar
        </button>
      </div>

      {posts.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          No hay notas publicadas aún.
        </p>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          {cursor && <LoadMore onLoadMore={loadMore} loading={loading} />}
        </>
      )}
    </div>
  );
}
