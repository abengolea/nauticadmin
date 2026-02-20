"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Clock } from "lucide-react";
import { useFirestore, useUserProfile, useDoc } from "@/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import type { AppointmentConfig, AppointmentIntervalMinutes } from "@/lib/types/appointments";
import { APPOINTMENT_INTERVAL_OPTIONS } from "@/lib/types/appointments";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const DAY_NAMES: { value: number; label: string }[] = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
];

const CONFIG_DOC_ID = "default";

const DEFAULT_CONFIG: Omit<AppointmentConfig, "id"> = {
  enabled: false,
  slotIntervalMinutes: 15,
  openTime: "09:00",
  closeTime: "18:00",
  enabledDays: [1, 2, 3, 4, 5], // Lun-Vie
  advanceBookingDays: 7,
};

interface AppointmentConfigFormProps {
  schoolId: string;
}

export function AppointmentConfigForm({ schoolId }: AppointmentConfigFormProps) {
  const firestore = useFirestore();
  const { user } = useUserProfile();
  const { toast } = useToast();
  const { data: config, loading } = useDoc<AppointmentConfig & { id: string }>(
    `schools/${schoolId}/appointmentConfig/${CONFIG_DOC_ID}`
  );

  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(DEFAULT_CONFIG.enabled);
  const [slotIntervalMinutes, setSlotIntervalMinutes] =
    useState<AppointmentIntervalMinutes>(DEFAULT_CONFIG.slotIntervalMinutes);
  const [openTime, setOpenTime] = useState(DEFAULT_CONFIG.openTime);
  const [closeTime, setCloseTime] = useState(DEFAULT_CONFIG.closeTime);
  const [enabledDays, setEnabledDays] = useState<number[]>(DEFAULT_CONFIG.enabledDays);
  const [advanceBookingDays, setAdvanceBookingDays] = useState(DEFAULT_CONFIG.advanceBookingDays);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled ?? false);
      setSlotIntervalMinutes(config.slotIntervalMinutes ?? 15);
      setOpenTime(config.openTime ?? "09:00");
      setCloseTime(config.closeTime ?? "18:00");
      setEnabledDays(config.enabledDays ?? [1, 2, 3, 4, 5]);
      setAdvanceBookingDays(config.advanceBookingDays ?? 7);
    }
  }, [config]);

  const toggleDay = (day: number) => {
    setEnabledDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const handleSave = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      const ref = doc(firestore, "schools", schoolId, "appointmentConfig", CONFIG_DOC_ID);
      await setDoc(
        ref,
        {
          enabled,
          slotIntervalMinutes,
          openTime,
          closeTime,
          enabledDays,
          advanceBookingDays,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );
      toast({
        title: "Configuración guardada",
        description: "Los turnos se actualizaron correctamente.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo guardar.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Configuración de turnos
        </CardTitle>
        <CardDescription>
          Define el intervalo entre turnos, horarios de atención y días habilitados. Los clientes
          podrán reservar desde la app según esta configuración.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between space-x-2">
          <Label htmlFor="enabled">Sistema de turnos habilitado</Label>
          <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="interval">Intervalo entre turnos</Label>
            <Select
              value={String(slotIntervalMinutes)}
              onValueChange={(v) => setSlotIntervalMinutes(Number(v) as AppointmentIntervalMinutes)}
            >
              <SelectTrigger id="interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPOINTMENT_INTERVAL_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    Cada {m} minutos
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="advance">Días de anticipación para reservar</Label>
            <Input
              id="advance"
              type="number"
              min={1}
              max={90}
              value={advanceBookingDays}
              onChange={(e) => setAdvanceBookingDays(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="open">Hora de apertura</Label>
            <Input
              id="open"
              type="time"
              value={openTime}
              onChange={(e) => setOpenTime(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="close">Hora de cierre</Label>
            <Input
              id="close"
              type="time"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Días de la semana habilitados</Label>
          <div className="flex flex-wrap gap-3">
            {DAY_NAMES.map(({ value, label }) => (
              <div key={value} className="flex items-center space-x-2">
                <Checkbox
                  id={`day-${value}`}
                  checked={enabledDays.includes(value)}
                  onCheckedChange={() => toggleDay(value)}
                />
                <Label htmlFor={`day-${value}`} className="cursor-pointer font-normal">
                  {label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Guardar configuración
        </Button>
      </CardContent>
    </Card>
  );
}
