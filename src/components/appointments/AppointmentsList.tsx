"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFirestore, useDoc } from "@/firebase";
import { getAppointmentsByDateRange } from "@/lib/appointments/db";
import type { Appointment, Player } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, CalendarDays } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Reservado",
  completed: "Realizado",
  cancelled: "Cancelado",
  no_show: "No asistió",
};

interface AppointmentsListProps {
  schoolId: string;
}

export function AppointmentsList({ schoolId }: AppointmentsListProps) {
  const firestore = useFirestore();
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [appointmentsForDay, setAppointmentsForDay] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);
    setLoading(true);
    getAppointmentsByDateRange(firestore, schoolId, dayStart, dayEnd)
      .then((apts) => apts.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()))
      .then(setAppointmentsForDay)
      .finally(() => setLoading(false));
  }, [firestore, schoolId, selectedDate]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Turnos del día
        </CardTitle>
        <CardDescription>
          Selecciona una fecha para ver los turnos reservados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(d) => d && setSelectedDate(d)}
          locale={es}
        />
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : appointmentsForDay.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No hay turnos reservados para esta fecha.
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horario</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointmentsForDay.map((apt) => (
                  <AppointmentRow key={apt.id} appointment={apt} schoolId={schoolId} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AppointmentRow({
  appointment,
  schoolId,
}: {
  appointment: Appointment;
  schoolId: string;
}) {
  const start = appointment.startTime instanceof Date
    ? appointment.startTime
    : new Date(appointment.startTime);
  const { data: player } = useDoc<Player>(
    `schools/${schoolId}/players/${appointment.playerId}`
  );
  const displayName = player
    ? `${player.firstName} ${player.lastName}`
    : appointment.playerId;

  return (
    <TableRow>
      <TableCell className="font-medium">
        {format(start, "HH:mm")}
      </TableCell>
      <TableCell>{displayName}</TableCell>
      <TableCell>
        <Badge variant={appointment.status === "scheduled" ? "default" : "secondary"}>
          {STATUS_LABELS[appointment.status] ?? appointment.status}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {appointment.notes ?? "-"}
      </TableCell>
    </TableRow>
  );
}
