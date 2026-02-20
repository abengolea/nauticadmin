"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  Download,
  Building,
  Users,
  UserCircle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useFirestore } from "@/firebase";
import { collectionGroup, getDocs, query, limit } from "firebase/firestore";
import type { School, PlatformUser, Player } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/** Jugador con schoolId extraído del path (collection group). */
type PlayerWithSchoolId = Player & { schoolId: string };

function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsvValue(c: string | number | Date | undefined | { toDate?: () => Date }): string {
  if (c == null) return "";
  if (c instanceof Date) return format(c, "yyyy-MM-dd", { locale: es });
  if (typeof c === "object" && typeof (c as { toDate?: () => Date }).toDate === "function")
    return format((c as { toDate: () => Date }).toDate(), "yyyy-MM-dd", { locale: es });
  return escapeCsvCell(c);
}

function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | Date | undefined | { toDate?: () => Date })[][]
) {
  const line = (row: (string | number | Date | undefined | { toDate?: () => Date })[]) =>
    row.map(toCsvValue).join(",");
  const csv = [headers.join(","), ...rows.map(line)].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type SuperAdminReportsTabProps = {
  schools: School[] | null;
  platformUsers: PlatformUser[] | null;
  schoolsLoading: boolean;
  usersLoading: boolean;
};

export function SuperAdminReportsTab({
  schools,
  platformUsers,
  schoolsLoading,
  usersLoading,
}: SuperAdminReportsTabProps) {
  const router = useRouter();
  const firestore = useFirestore();
  const [allPlayers, setAllPlayers] = useState<PlayerWithSchoolId[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPlayersLoading(true);
    const q = query(collectionGroup(firestore, "players"), limit(5000));
    getDocs(q)
      .then((snap) => {
        if (cancelled) return;
        const list: PlayerWithSchoolId[] = [];
        snap.docs.forEach((d) => {
          const pathParts = d.ref.path.split("/");
          const schoolId = pathParts[1];
          const data = d.data();
          const createdAt = data.createdAt?.toDate?.() ?? new Date();
          list.push({
            id: d.id,
            schoolId,
            firstName: data.firstName ?? "",
            lastName: data.lastName ?? "",
            tutorContact: data.tutorContact ?? { name: "", phone: "" },
            status: data.status ?? "active",
            createdAt,
            createdBy: data.createdBy ?? "",
            archived: data.archived ?? false,
            ...data,
          } as PlayerWithSchoolId);
        });
        setAllPlayers(list);
      })
      .catch(() => setAllPlayers([]))
      .finally(() => {
        if (!cancelled) setPlayersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [firestore]);

  const playersBySchool = useMemo(() => {
    const map = new Map<string, { count: number; active: number }>();
    (schools ?? []).forEach((s) => map.set(s.id, { count: 0, active: 0 }));
    allPlayers.forEach((p) => {
      if (p.archived) return;
      const cur = map.get(p.schoolId) ?? { count: 0, active: 0 };
      cur.count += 1;
      if (p.status === "active") cur.active += 1;
      map.set(p.schoolId, cur);
    });
    return map;
  }, [schools, allPlayers]);

  const totalPlayers = useMemo(
    () => allPlayers.filter((p) => !p.archived).length,
    [allPlayers]
  );

  const isLoading = schoolsLoading || usersLoading || playersLoading;

  const handleExportSchools = () => {
    if (!schools?.length) return;
    downloadCsv(
      `escuelas-${format(new Date(), "yyyy-MM-dd")}.csv`,
      ["Nombre", "Ciudad", "Provincia", "Dirección", "Estado", "Fecha creación"],
      schools.map((s) => [
        s.name,
        s.city,
        s.province,
        s.address ?? "",
        s.status,
        s.createdAt,
      ])
    );
  };

  const handleExportUsers = () => {
    if (!platformUsers?.length) return;
    downloadCsv(
      `usuarios-plataforma-${format(new Date(), "yyyy-MM-dd")}.csv`,
      ["Email", "Super Admin", "Fecha creación"],
      platformUsers.map((u) => [
        u.email,
        u.super_admin ? "Sí" : "No",
        (u as { createdAt?: Date | { toDate?: () => Date } }).createdAt ?? "",
      ])
    );
  };

  const handleExportPlayers = () => {
    if (!allPlayers.length || !schools?.length) return;
    const schoolNames = new Map(schools.map((s) => [s.id, s.name]));
    downloadCsv(
      `jugadores-${format(new Date(), "yyyy-MM-dd")}.csv`,
      ["Escuela", "Nombre", "Apellido", "Estado", "Archivado", "Fecha creación"],
      allPlayers.map((p) => [
        schoolNames.get(p.schoolId) ?? p.schoolId,
        p.firstName,
        p.lastName,
        p.status,
        p.archived ? "Sí" : "No",
        p.createdAt,
      ])
    );
  };

  const handleQuickAccess = (schoolId: string) => {
    if (!schoolId) return;
    router.push(`/dashboard/schools/${schoolId}`);
  };

  const schoolList = schools ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5" />
            Métricas globales
          </CardTitle>
          <CardDescription>
            Totales y distribución de jugadores por escuela.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total jugadores</CardTitle>
                <UserCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {playersLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{totalPlayers}</div>
                )}
                <div className="text-xs text-muted-foreground">Sin contar archivados</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Escuelas</CardTitle>
                <Building className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {schoolsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{schoolList.length}</div>
                )}
                <div className="text-xs text-muted-foreground">
                  {schoolList.filter((s) => s.status === "active").length} activas
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Usuarios plataforma</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{platformUsers?.length ?? 0}</div>
                )}
                <div className="text-xs text-muted-foreground">Registrados</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ir a escuela</CardTitle>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <Select onValueChange={handleQuickAccess}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar escuela..." />
                  </SelectTrigger>
                  <SelectContent>
                    {schoolList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Jugadores por escuela</h3>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Escuela</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Activos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading &&
                    schoolList.map((s) => {
                      const stats = playersBySchool.get(s.id) ?? { count: 0, active: 0 };
                      return (
                        <TableRow
                          key={s.id}
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => router.push(`/dashboard/schools/${s.id}`)}
                        >
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-right">{stats.count}</TableCell>
                          <TableCell className="text-right">{stats.active}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="h-5 w-5" />
            Exportar datos
          </CardTitle>
          <CardDescription>
            Descargar listados en CSV para reportes o auditoría.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportSchools}
            disabled={!schools?.length}
          >
            Exportar escuelas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportUsers}
            disabled={!platformUsers?.length}
          >
            Exportar usuarios
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPlayers}
            disabled={!allPlayers.length}
          >
            Exportar jugadores
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
