"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFirestore } from "@/firebase";
import { getAttendanceHistoryForPlayer } from "@/lib/attendance";
import type { Attendance } from "@/lib/types";
import { ClipboardCheck, UserCheck, UserX } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  schoolId: string;
  playerId: string;
};

const statusConfig: Record<
  Attendance["status"],
  { label: string; icon: typeof UserCheck; className: string }
> = {
  presente: {
    label: "Presente",
    icon: UserCheck,
    className: "text-green-600 dark:text-green-400",
  },
  ausente: {
    label: "Ausente",
    icon: UserX,
    className: "text-destructive",
  },
  justificado: {
    label: "Justificado",
    icon: ClipboardCheck,
    className: "text-amber-600 dark:text-amber-400",
  },
};

export function AttendanceHistory({ schoolId, playerId }: Props) {
  const firestore = useFirestore();
  const [items, setItems] = useState<
    Array<{ date: Date; status: Attendance["status"] }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getAttendanceHistoryForPlayer(firestore, schoolId, playerId)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [firestore, schoolId, playerId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          <ClipboardCheck className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <h3 className="font-semibold text-foreground">Historial de asistencia</h3>
          <p className="mt-2">
            Aún no hay registros de asistencia para este jugador.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalPracticas = items.length;
  const ausentes = items.filter((i) => i.status === "ausente").length;
  const justificados = items.filter((i) => i.status === "justificado").length;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="font-semibold text-foreground">Historial de asistencia</h3>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-sm font-medium">
              <span className="text-foreground font-semibold">{totalPracticas}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-destructive">{ausentes}</span>
              <span className="text-muted-foreground text-xs">prácticas / inasistencias</span>
            </span>
            {justificados > 0 && (
              <span className="text-xs text-muted-foreground">{justificados} justificado{justificados !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
        <ul className="space-y-3">
          {items.map(({ date, status }, i) => {
            const config = statusConfig[status];
            const Icon = config.icon;
            return (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <span className="text-sm text-muted-foreground">
                  {format(date, "EEEE d 'de' MMMM yyyy", { locale: es })}
                </span>
                <span className={cn("flex items-center gap-2 text-sm font-medium", config.className)}>
                  <Icon className="h-4 w-4" />
                  {config.label}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
