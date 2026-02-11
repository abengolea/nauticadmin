"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useUserProfile } from "@/firebase";
import { NotaForm } from "@/components/notas/NotaForm";

export default function NuevaNotaPage() {
  const router = useRouter();
  const { profile, isReady, isSuperAdmin } = useUserProfile();
  const [mounted, setMounted] = useState(false);

  const canCreate = profile?.role === "school_admin" || profile?.role === "coach" || profile?.role === "editor" || isSuperAdmin;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isReady) return;
    if (!canCreate) {
      router.replace("/dashboard/notas");
      return;
    }
  }, [mounted, isReady, canCreate, router]);

  if (!isReady || !canCreate) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight font-headline">Nueva nota</h1>
      <p className="text-muted-foreground mt-1 mb-6">Creá un borrador para publicar después.</p>
      <NotaForm mode="create" />
    </div>
  );
}
