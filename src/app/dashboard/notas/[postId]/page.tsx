"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useUserProfile, useFirebase } from "@/firebase";
import { getAuth } from "firebase/auth";
import { NotaForm } from "@/components/notas/NotaForm";
import type { Post } from "@/lib/types/posts";

export default function EditarNotaPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params?.postId as string;
  const { profile, isReady, isSuperAdmin } = useUserProfile();
  const { app } = useFirebase();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  const canEdit = profile?.role === "school_admin" || profile?.role === "coach" || profile?.role === "editor" || isSuperAdmin;

  useEffect(() => {
    if (!postId || !isReady || !app) return;
    if (!canEdit) {
      router.replace("/dashboard/notas");
      return;
    }
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    user
      .getIdToken()
      .then((token) =>
        fetch(`/api/posts/${postId}`, { headers: { Authorization: `Bearer ${token}` } })
      )
      .then((r) => r.json())
      .then((data) => {
        if (data.id) setPost(data);
        else router.replace("/dashboard/notas");
      })
      .catch(() => router.replace("/dashboard/notas"))
      .finally(() => setLoading(false));
  }, [postId, isReady, canEdit, app, router]);

  if (!isReady || !canEdit || loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!post) return null;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight font-headline">Editar nota</h1>
      <p className="text-muted-foreground mt-1 mb-6">{post.title}</p>
      <NotaForm mode="edit" post={post} />
    </div>
  );
}
