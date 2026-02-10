"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Activity } from "lucide-react";
import { useUserProfile, useCollection } from "@/firebase";
import type { School } from "@/lib/types";
import { SuperAdminPhysicalTemplateTab } from "@/components/admin/SuperAdminPhysicalTemplateTab";

export default function PhysicalTemplatePage() {
  const router = useRouter();
  const { isSuperAdmin, isReady } = useUserProfile();
  const { data: schools, loading: schoolsLoading } = useCollection<School>("schools", {
    orderBy: ["createdAt", "desc"],
  });

  useEffect(() => {
    if (!isReady) return;
    if (!isSuperAdmin) {
      router.replace("/dashboard");
      return;
    }
  }, [isReady, isSuperAdmin, router]);

  if (!isReady || !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Activity className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">
            Plantilla de evaluaciones físicas
          </h1>
          <p className="text-muted-foreground">
            Tests predefinidos y propuestas de entrenadores. Aceptá tests para que estén disponibles en todas las escuelas.
          </p>
        </div>
      </div>
      <SuperAdminPhysicalTemplateTab schools={schools ?? null} />
    </div>
  );
}
