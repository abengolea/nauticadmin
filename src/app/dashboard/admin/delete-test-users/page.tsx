"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Trash2, AlertTriangle, UserX } from "lucide-react";
import { useCollection, useUserProfile, useFirebase } from "@/firebase";
import { getAuth } from "firebase/auth";
import type { PlatformUser } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function DeleteTestUsersPage() {
  const router = useRouter();
  const { app } = useFirebase();
  const { user: currentUser, isSuperAdmin, isReady } = useUserProfile();
  const { data: platformUsers, loading } = useCollection<PlatformUser>("platformUsers", {
    orderBy: ["createdAt", "desc"],
  });
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (!isSuperAdmin) {
      router.replace("/dashboard");
      return;
    }
  }, [isReady, isSuperAdmin, router]);

  const getToken = async () => {
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  };

  const usersDeletable = (platformUsers ?? []).filter(
    (u) => u.id !== currentUser?.uid && !u.super_admin
  );

  const toggleUser = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === usersDeletable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(usersDeletable.map((u) => u.id)));
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const token = await getToken();
    if (!token) {
      toast({ variant: "destructive", title: "Error", description: "No hay sesión activa." });
      setDeleting(false);
      setConfirmOpen(false);
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const uid of selectedIds) {
      try {
        const res = await fetch("/api/admin/delete-test-user", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ uid }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) ok++;
        else {
          fail++;
          console.error("[delete-test-user]", data);
        }
      } catch (e) {
        fail++;
        console.error(e);
      }
    }
    setDeleting(false);
    setConfirmOpen(false);
    setSelectedIds(new Set());
    if (fail === 0) {
      toast({
        title: "Usuarios borrados",
        description: `Se eliminaron ${ok} usuario(s) y todas sus referencias en la base de datos.`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Borrado parcial",
        description: `Se borraron ${ok} y fallaron ${fail}. Revisa la consola.`,
      });
    }
  };

  if (!isReady || !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-2">
          <UserX className="h-8 w-8" />
          Borrar usuarios de prueba
        </h1>
        <p className="text-muted-foreground">
          Elimina usuarios y todas sus referencias (Auth, platformUsers, escuelas, playerLogins,
          solicitudes, verificación de email) para poder volver a probar flujos de registro.
        </p>
      </div>

      <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5" />
            Solo para pruebas
          </CardTitle>
          <CardDescription>
            No se puede deshacer. Los usuarios seleccionados perderán acceso y sus datos en la
            plataforma. No se muestran ni se pueden borrar super admins ni tu propio usuario.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios que puedes borrar</CardTitle>
          <CardDescription>
            Marca los que quieras eliminar y pulsa &quot;Borrar seleccionados&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando usuarios…
            </div>
          ) : usersDeletable.length === 0 ? (
            <p className="text-muted-foreground">
              No hay otros usuarios que se puedan borrar (solo super admins o tú).
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Checkbox
                  id="select-all"
                  checked={selectedIds.size === usersDeletable.length && usersDeletable.length > 0}
                  onCheckedChange={selectAll}
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  Seleccionar todos
                </label>
              </div>
              <ul className="space-y-2 max-h-[400px] overflow-y-auto">
                {usersDeletable.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedIds.has(u.id)}
                      onCheckedChange={() => toggleUser(u.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{u.email}</span>
                      <span className="text-muted-foreground text-sm ml-2">
                        Registro: {format(u.createdAt, "dd/MM/yyyy HH:mm", { locale: es })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-2">
                <Button
                  variant="destructive"
                  disabled={selectedIds.size === 0 || deleting}
                  onClick={() => setConfirmOpen(true)}
                >
                  {deleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Borrar {selectedIds.size > 0 ? `(${selectedIds.size})` : ""} seleccionados
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar estos usuarios?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán {selectedIds.size} usuario(s) de Firebase Auth y todas sus referencias
              en Firestore (platformUsers, escuelas, playerLogins, solicitudes, verificación de
              email). No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Sí, borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
