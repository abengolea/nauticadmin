"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Loader2, ExternalLink, Edit, Archive, Send, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Post } from "@/lib/types/posts";
import type { UserProfile } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

interface NotasAdminListProps {
  token: string | null;
  profile: UserProfile | null;
  isSuperAdmin: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
};

export function NotasAdminList({ token, profile, isSuperAdmin }: NotasAdminListProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [schoolFilter, setSchoolFilter] = useState<string>("");
  const [schools, setSchools] = useState<Array<{ schoolId: string; schoolName: string; schoolSlug: string }>>([]);
  const { toast } = useToast();

  const canPublish = profile?.role === "school_admin" || isSuperAdmin;

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const baseParams: Record<string, string> = { limit: "50" };
    if (schoolFilter) baseParams.schoolId = schoolFilter;

    if (statusFilter === "all") {
      Promise.all([
        fetch(`/api/posts?${new URLSearchParams({ ...baseParams, status: "draft" })}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        fetch(`/api/posts?${new URLSearchParams({ ...baseParams, status: "published" })}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        fetch(`/api/posts?${new URLSearchParams({ ...baseParams, status: "archived" })}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      ])
        .then(([draft, published, archived]) => {
          setPosts([
            ...(draft.posts ?? []),
            ...(published.posts ?? []),
            ...(archived.posts ?? []),
          ]);
        })
        .catch(() => setPosts([]))
        .finally(() => setLoading(false));
    } else {
      fetch(`/api/posts?${new URLSearchParams({ ...baseParams, status: statusFilter })}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => setPosts(data.posts ?? []))
        .catch(() => setPosts([]))
        .finally(() => setLoading(false));
    }
  }, [token, statusFilter, schoolFilter]);

  useEffect(() => {
    if (!token) return;
    fetch("/api/posts/schools", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setSchools(data.schools ?? []))
      .catch(() => setSchools([]));
  }, [token]);

  const handleAction = async (
    postId: string,
    action: "publish" | "unpublish" | "archive"
  ) => {
    if (!token) return;
    const path = `/api/posts/${postId}/${action}`;
    const res = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) {
      toast({ variant: "destructive", title: "Error", description: data.error ?? "Error al ejecutar" });
      return;
    }
    toast({ title: "Listo", description: action === "publish" ? "Nota publicada" : action === "unpublish" ? "Nota despublicada" : "Nota archivada" });
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        if (action === "publish") return { ...p, status: "published" as const };
        if (action === "unpublish") return { ...p, status: "draft" as const };
        return { ...p, status: "archived" as const };
      })
    );
  };

  const filteredPosts = schoolFilter
    ? posts.filter((p) => p.schoolId === schoolFilter)
    : posts;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
          aria-label="Filtrar por estado"
        >
          <option value="all">Todos</option>
          <option value="draft">Borradores</option>
          <option value="published">Publicados</option>
          <option value="archived">Archivados</option>
        </select>
        {isSuperAdmin && (
          <select
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            aria-label="Filtrar por escuela"
          >
            <option value="">Todas las escuelas</option>
            {schools.map((s) => (
              <option key={s.schoolId} value={s.schoolId}>
                {s.schoolName}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Escuela</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPosts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No hay notas.
                </TableCell>
              </TableRow>
            ) : (
              filteredPosts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="font-medium">{post.title}</TableCell>
                  <TableCell>{post.schoolName}</TableCell>
                  <TableCell>
                    <Badge variant={post.status === "published" ? "default" : "secondary"}>
                      {STATUS_LABELS[post.status] ?? post.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {post.publishedAt
                      ? format(post.publishedAt instanceof Date ? post.publishedAt : new Date(post.publishedAt), "d/M/yyyy", { locale: es })
                      : format(post.updatedAt instanceof Date ? post.updatedAt : new Date(post.updatedAt), "d/M/yyyy", { locale: es })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {post.status === "published" && (
                        <Button variant="ghost" size="icon" asChild>
                          <a
                            href={`/escuelas/${post.schoolSlug}/notas/${post.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Ver nota publicada"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" asChild>
                        <a href={`/dashboard/notas/${post.id}`} aria-label="Editar nota">
                          <Edit className="h-4 w-4" />
                        </a>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Más acciones">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canPublish && post.status === "draft" && (
                            <DropdownMenuItem onClick={() => handleAction(post.id, "publish")}>
                              <Send className="mr-2 h-4 w-4" />
                              Publicar
                            </DropdownMenuItem>
                          )}
                          {canPublish && post.status === "published" && (
                            <DropdownMenuItem onClick={() => handleAction(post.id, "unpublish")}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Despublicar
                            </DropdownMenuItem>
                          )}
                          {canPublish && post.status !== "archived" && (
                            <DropdownMenuItem onClick={() => handleAction(post.id, "archive")}>
                              <Archive className="mr-2 h-4 w-4" />
                              Archivar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
