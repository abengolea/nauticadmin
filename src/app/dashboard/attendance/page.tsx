"use client";

import { useUserProfile } from "@/firebase";
import { AttendanceSheet } from "@/components/attendance/AttendanceSheet";
import { ClipboardCheck } from "lucide-react";

export default function AttendancePage() {
  const { activeSchoolId, isReady } = useUserProfile();

  if (!isReady) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          Planilla de asistencia
        </h1>
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  if (!activeSchoolId) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          Planilla de asistencia
        </h1>
        <p className="text-muted-foreground">
          No tenés una escuela seleccionada. Elegí una sede en Ajustes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 min-w-0">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">
            Planilla de asistencia
          </h1>
          <p className="text-muted-foreground">
            Marcá los jugadores que faltaron al entrenamiento.
          </p>
        </div>
      </div>
      <AttendanceSheet schoolId={activeSchoolId} />
    </div>
  );
}
