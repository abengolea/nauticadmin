"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useFirestore, useUserProfile, useDoc } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar, Clock } from "lucide-react";
import { getAvailableDates, formatDateDisplay } from "@/lib/appointments/utils";
import { getAvailableSlots, createAppointment } from "@/lib/appointments/db";
import type { AppointmentConfig } from "@/lib/types/appointments";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppointmentsPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { profile, isReady } = useUserProfile();
  const { toast } = useToast();

  const schoolId = profile?.activeSchoolId ?? "";
  const playerId = profile?.playerId ?? "";

  const { data: config, loading: configLoading } = useDoc<
    AppointmentConfig & { id: string }
  >(schoolId ? `schools/${schoolId}/appointmentConfig/default` : "");

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isReady || !profile) return;
    if (profile.role !== "player" || !schoolId || !playerId) {
      router.replace("/dashboard");
      return;
    }
  }, [isReady, profile, schoolId, playerId, router]);

  useEffect(() => {
    if (!config?.enabled || !selectedDate) {
      setSlots([]);
      return;
    }
    setSlotsLoading(true);
    getAvailableSlots(firestore, schoolId, config, selectedDate)
      .then(setSlots)
      .finally(() => setSlotsLoading(false));
  }, [config, selectedDate, schoolId, firestore]);

  const availableDates = config ? getAvailableDates(config) : [];
  const canBook = config?.enabled && selectedDate && selectedSlot && profile?.uid;

  const handleBook = async () => {
    if (!canBook || !profile?.uid) return;
    setSubmitting(true);
    try {
      await createAppointment(
        firestore,
        schoolId,
        playerId,
        selectedDate!,
        selectedSlot!,
        profile.uid,
        notes.trim() || undefined,
        config?.appointmentDurationMinutes ?? config?.slotIntervalMinutes
      );
      toast({
        title: "Turno reservado",
        description: `Tu turno para el ${formatDateDisplay(selectedDate!)} a las ${selectedSlot} fue confirmado.`,
      });
      setSelectedDate(null);
      setSelectedSlot(null);
      setNotes("");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo reservar el turno.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isReady || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profile.role !== "player" || !schoolId || !playerId) {
    return null;
  }

  if (configLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!config?.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sacar turno</CardTitle>
          <CardDescription>
            El sistema de turnos no está habilitado para tu náutica. Contacta al administrador.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-2">
          <Calendar className="h-8 w-8" />
          Sacar turno
        </h1>
        <p className="text-muted-foreground">
          Selecciona una fecha y horario disponible para reservar tu turno.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. Elegir fecha</CardTitle>
            <CardDescription>
              Días habilitados según la configuración de la náutica.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {availableDates.slice(0, 14).map((d) => (
                <Button
                  key={d.toISOString()}
                  variant={selectedDate?.toDateString() === d.toDateString() ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedDate(d);
                    setSelectedSlot(null);
                  }}
                >
                  {formatDateDisplay(d)}
                </Button>
              ))}
            </div>
            {availableDates.length > 14 && (
              <p className="text-xs text-muted-foreground mt-2">
                + {availableDates.length - 14} fechas más disponibles
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">2. Elegir horario</CardTitle>
            <CardDescription>
              {selectedDate
                ? "Horarios disponibles para la fecha seleccionada."
                : "Primero selecciona una fecha."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedDate ? (
              <p className="text-sm text-muted-foreground">Selecciona una fecha primero.</p>
            ) : slotsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay horarios disponibles para esta fecha.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <Button
                    key={slot}
                    variant={selectedSlot === slot ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {slot}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedDate && selectedSlot && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">3. Confirmar reserva</CardTitle>
            <CardDescription>
              Turno: {formatDateDisplay(selectedDate)} a las {selectedSlot}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Ej: consulta sobre amarra, mantenimiento..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            <Button onClick={handleBook} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
              Confirmar turno
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
