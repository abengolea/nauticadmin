"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFirebase } from "@/firebase";
import { getAuth } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import { slugify } from "@/lib/posts/slugify";
import { PostContentRenderer } from "./PostContentRenderer";
import type { Post } from "@/lib/types/posts";

interface NotaFormProps {
  mode: "create" | "edit";
  post?: Post;
}

export function NotaForm({ mode, post }: NotaFormProps) {
  const router = useRouter();
  const { app } = useFirebase();
  const { toast } = useToast();
  const [schools, setSchools] = useState<Array<{ schoolId: string; schoolName: string; schoolSlug: string }>>([]);
  const [schoolId, setSchoolId] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverImageName, setCoverImageName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const currentSchool = schools.find((s) => s.schoolId === schoolId);

  useEffect(() => {
    if (!app) return;
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) return;
    user.getIdToken().then((token) => {
      fetch("/api/posts/schools", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          const list = data.schools ?? [];
          setSchools(list);
          if (list.length > 0 && !schoolId) {
            setSchoolId(list[0].schoolId);
          }
        });
    });
  }, [app]);

  useEffect(() => {
    if (mode === "edit" && post) {
      setTitle(post.title);
      setSlug(post.slug);
      setExcerpt(post.excerpt);
      setContent(post.content);
      setTagsStr((post.tags ?? []).join(", "));
      setCoverImageUrl(post.coverImageUrl ?? "");
      setCoverImageName(post.coverImageUrl ? "Imagen guardada" : "");
      setSchoolId(post.schoolId);
    }
  }, [mode, post]);

  useEffect(() => {
    if (mode === "create" && title && !slug) {
      setSlug(slugify(title));
    }
  }, [mode, title, slug]);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentSchool) return;
    setUploading(true);
    try {
      const auth = getAuth(app!);
      const user = auth.currentUser;
      if (!user) throw new Error("No autenticado");
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.set("file", file);
      formData.set("schoolId", currentSchool.schoolId);
      formData.set("postId", post?.id ?? "temp");
      const res = await fetch("/api/posts/upload-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al subir");
      setCoverImageUrl(data.url);
      setCoverImageName(file.name);
      toast({ title: "Imagen subida", description: file.name });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: String(err) });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSchool) {
      toast({ variant: "destructive", title: "Seleccioná una escuela" });
      return;
    }
    setSaving(true);
    try {
      const auth = getAuth(app!);
      const user = auth.currentUser;
      if (!user) throw new Error("No autenticado");
      const token = await user.getIdToken();
      const tags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);

      if (mode === "create") {
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            schoolId: currentSchool.schoolId,
            schoolSlug: currentSchool.schoolSlug,
            schoolName: currentSchool.schoolName,
            title,
            slug: slug || slugify(title),
            excerpt,
            content,
            coverImageUrl: coverImageUrl || undefined,
            tags: tags.length ? tags : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? data.detail ?? "Error al crear");
        toast({ title: "Borrador creado" });
        router.push(`/dashboard/notas/${data.id}`);
      } else if (post) {
        const res = await fetch(`/api/posts/${post.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title,
            slug: slug || slugify(title),
            excerpt,
            content,
            coverImageUrl: coverImageUrl || undefined,
            tags: tags.length ? tags : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? data.detail ?? "Error al guardar");
        toast({ title: "Guardado" });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {schools.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="school">Escuela</Label>
          <select
            id="school"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
          >
            {schools.map((s) => (
              <option key={s.schoolId} value={s.schoolId}>
                {s.schoolName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título de la nota"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Slug (URL)</Label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="url-de-la-nota"
        />
        <p className="text-xs text-muted-foreground">
          Se genera automáticamente desde el título. Podés editarlo.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="excerpt">Bajada / Resumen</Label>
        <Textarea
          id="excerpt"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder="Breve descripción para listados"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Contenido (Markdown)</Label>
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">Editar</TabsTrigger>
            <TabsTrigger value="preview">Vista previa</TabsTrigger>
          </TabsList>
          <TabsContent value="edit">
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escribí en Markdown..."
              rows={12}
              className="font-mono text-sm"
            />
          </TabsContent>
          <TabsContent value="preview">
            <div className="rounded-md border bg-muted/30 p-4 min-h-[200px] prose prose-sm dark:prose-invert max-w-none">
              {content ? <PostContentRenderer content={content} /> : <p className="text-muted-foreground">Sin contenido.</p>}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="space-y-2">
        <Label>Imagen destacada</Label>
        {coverImageUrl ? (
          <div className="space-y-2">
            <img src={coverImageUrl} alt="" className="max-h-48 rounded-lg object-cover" />
            {coverImageName && (
              <p className="text-sm text-muted-foreground">Guardado: {coverImageName}</p>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => { setCoverImageUrl(""); setCoverImageName(""); }}>
              Quitar
            </Button>
          </div>
        ) : (
          <div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleCoverUpload}
              disabled={uploading || !currentSchool}
              className="hidden"
              id="cover-upload"
            />
            <Label htmlFor="cover-upload">
              <span className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm cursor-pointer hover:bg-accent">
                {uploading ? "Subiendo..." : "Subir imagen"}
              </span>
            </Label>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">Etiquetas (separadas por coma)</Label>
        <Input
          id="tags"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          placeholder="actividad, jornada, comunicado"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando..." : mode === "create" ? "Crear borrador" : "Guardar"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/notas")}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
