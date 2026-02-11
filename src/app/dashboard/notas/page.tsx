"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserProfile } from "@/firebase";
import { getAuth } from "firebase/auth";
import { useFirebase } from "@/firebase";
import { NotasAdminList } from "@/components/notas/NotasAdminList";

export default function NotasAdminPage() {
  const router = useRouter();
  const { profile, isReady, isSuperAdmin } = useUserProfile();
  const { app } = useFirebase();
  const [token, setToken] = useState<string | null>(null);

  const isStaff = profile?.role === "school_admin" || profile?.role === "coach" || profile?.role === "editor" || profile?.role === "viewer";

  useEffect(() => {
    if (!isReady) return;
    if (!isStaff && !isSuperAdmin) {
      router.replace("/dashboard");
      return;
    }
  }, [isReady, isStaff, isSuperAdmin, router]);

  useEffect(() => {
    if (!app) return;
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) return;
    user.getIdToken().then(setToken).catch(() => setToken(null));
  }, [app]);

  if (!isReady || !isStaff) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-2">
            <Newspaper className="h-8 w-8" />
            Notas
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona las publicaciones de tu escuela.
          </p>
        </div>
        {(profile?.role === "school_admin" || profile?.role === "coach" || profile?.role === "editor" || isSuperAdmin) && (
          <Button asChild>
            <a href="/dashboard/notas/nueva">
              <Plus className="mr-2 h-4 w-4" />
              Nueva nota
            </a>
          </Button>
        )}
      </div>
      <NotasAdminList token={token} profile={profile} isSuperAdmin={isSuperAdmin ?? false} />
    </div>
  );
}
