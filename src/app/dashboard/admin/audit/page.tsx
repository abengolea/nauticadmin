"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, History } from "lucide-react";
import { useCollection, useUserProfile } from "@/firebase";
import type { AuditLogEntry } from "@/lib/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

const AUDIT_LIMIT = 200;

export default function AuditLogPage() {
  const router = useRouter();
  const { isSuperAdmin, isReady } = useUserProfile();
  const { data: entries, loading } = useCollection<AuditLogEntry>("auditLog", {
    orderBy: ["createdAt", "desc"],
    limit: AUDIT_LIMIT,
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

  const actionLabels: Record<string, string> = {
    "school.create": "Crear escuela",
    "school.update": "Actualizar escuela",
    "school.status_change": "Cambiar estado escuela",
    "platform_user.promote_super_admin": "Dar super admin",
    "platform_user.demote_super_admin": "Quitar super admin",
    "platform_config.update": "Actualizar configuración",
    "physical_assessment_template.accept_field": "Aceptar test en plantilla física",
  };

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-2">
          <History className="h-8 w-8" />
          Auditoría
        </h1>
        <p className="text-muted-foreground">
          Registro de acciones relevantes del super administrador.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actividad reciente</CardTitle>
          <CardDescription>
            Últimas {AUDIT_LIMIT} acciones (solo super admin).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 rounded-b-lg sm:rounded-none border-t sm:border-t-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sm:text-sm">Fecha</TableHead>
                  <TableHead className="text-xs sm:text-sm">Usuario</TableHead>
                  <TableHead className="text-xs sm:text-sm">Acción</TableHead>
                  <TableHead className="text-xs sm:text-sm">Recurso</TableHead>
                  <TableHead className="text-xs sm:text-sm">Escuela</TableHead>
                  <TableHead className="text-xs sm:text-sm max-w-[200px]">Detalles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    </TableRow>
                  ))
                )}
                {!loading && entries?.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {(() => {
                        const d = e.createdAt instanceof Date ? e.createdAt : (e.createdAt as { toDate?: () => Date })?.toDate?.();
                        return d ? format(d, "dd/MM/yyyy HH:mm", { locale: es }) : "-";
                      })()}
                    </TableCell>
                    <TableCell className="font-medium">{e.userEmail}</TableCell>
                    <TableCell>{actionLabels[e.action] ?? e.action}</TableCell>
                    <TableCell>{e.resourceType}</TableCell>
                    <TableCell>{e.schoolId ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate" title={e.details}>
                      {e.details ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!loading && (!entries || entries.length === 0) && (
            <p className="text-center text-muted-foreground py-8">No hay registros aún.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
