"use client";

import { useState, useEffect, useCallback } from "react";
import { format, addMinutes } from "date-fns";
import { es } from "date-fns/locale";
import {
  Ship,
  Loader2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MapPin,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile, useDoc } from "@/firebase";
import { getPlayerEmbarcaciones } from "@/lib/utils";
import type { Player } from "@/lib/types";
import {
  BOAT_RESERVATION_WINDOW_MINUTES,
  BOAT_RESERVATION_MAX_FUTURE_MINUTES,
} from "@/lib/boat-reservation/constants";

type SolicitudItem = {
  id: string;
  nombreEmbarcacion: string;
  status: string;
  createdAt: number | null;
  arrivalAt: number | null;
  salioAt: number | null;
  regresoAt: number | null;
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pendiente: { label: "Pendiente", variant: "secondary" },
  "salió": { label: "En el agua", variant: "default" },
  regresó: { label: "Devuelta", variant: "outline" },
};

interface ReservarLanchaViewProps {
  getToken: () => Promise<string | null>;
}

export function ReservarLanchaView({ getToken }: ReservarLanchaViewProps) {
  const { profile } = useUserProfile();
  const playerPath =
    profile?.activeSchoolId && profile?.playerId
      ? `schools/${profile.activeSchoolId}/players/${profile.playerId}`
      : "";
  const { data: player } = useDoc<Player>(playerPath);
  const embarcaciones = player ? getPlayerEmbarcaciones(player) : [];

  const [selectedEmbId, setSelectedEmbId] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [active, setActive] = useState<SolicitudItem[]>([]);
  const [history, setHistory] = useState<SolicitudItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const { toast } = useToast();

  const defaultArrivalTime = () => {
    const d = addMinutes(new Date(), BOAT_RESERVATION_WINDOW_MINUTES);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  };

  useEffect(() => {
    if (embarcaciones.length === 1 && !selectedEmbId) {
      setSelectedEmbId(embarcaciones[0].id ?? "0");
    }
  }, [embarcaciones, selectedEmbId]);

  useEffect(() => {
    setArrivalTime(defaultArrivalTime());
  }, []);

  const loadSolicitudes = useCallback(async () => {
    setLoadingList(true);
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/solicitud-embarcacion/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setActive(data.active ?? []);
        setHistory(data.history ?? []);
      }
    } finally {
      setLoadingList(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadSolicitudes();
    const interval = setInterval(loadSolicitudes, 30000);
    return () => clearInterval(interval);
  }, [loadSolicitudes]);

  const submitReservation = async (quickReserve: boolean) => {
    const token = await getToken();
    if (!token) {
      toast({ variant: "destructive", title: "Sesión expirada" });
      return;
    }
    if (!selectedEmbId && embarcaciones.length === 0) {
      toast({
        variant: "destructive",
        title: "Sin embarcaciones",
        description: "Completá tu perfil con al menos una embarcación.",
      });
      return;
    }

    const emb = embarcaciones.find((e) => e.id === selectedEmbId) ?? embarcaciones[0];
    if (!emb) return;

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        embarcacionId: emb.id,
        nombreEmbarcacion: (emb.nombre ?? emb.matricula ?? "").trim(),
        quickReserve,
      };
      if (!quickReserve && arrivalTime) {
        body.arrivalAt = new Date(arrivalTime).toISOString();
      }

      const res = await fetch("/api/solicitud-embarcacion/reservar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "No se pudo enviar",
          description: data.error ?? "Error desconocido",
        });
        return;
      }
      toast({
        title: "¡Pedido enviado!",
        description: "El operador preparará tu embarcación.",
      });
      await loadSolicitudes();
    } catch {
      toast({ variant: "destructive", title: "Error de conexión" });
    } finally {
      setSubmitting(false);
    }
  };

  const renderSolicitud = (s: SolicitudItem) => {
    const st = STATUS_LABELS[s.status] ?? { label: s.status, variant: "outline" as const };
    return (
      <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 border rounded-lg">
        <div>
          <p className="font-medium">{s.nombreEmbarcacion}</p>
          <p className="text-xs text-muted-foreground">
            Pedido: {s.createdAt ? format(new Date(s.createdAt), "d/MM/yyyy HH:mm", { locale: es }) : "—"}
            {s.arrivalAt && (
              <> · Llegada: {format(new Date(s.arrivalAt), "HH:mm", { locale: es })}</>
            )}
          </p>
        </div>
        <Badge variant={st.variant}>{st.label}</Badge>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-2">
          <Ship className="h-8 w-8" />
          Pedir mi lancha
        </h1>
        <p className="text-muted-foreground mt-1">
          Podés solicitar tu embarcación solo {BOAT_RESERVATION_WINDOW_MINUTES} minutos antes de llegar
        </p>
      </div>

      <Alert className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30">
        <MapPin className="h-4 w-4" />
        <AlertTitle>¿Cómo funciona?</AlertTitle>
        <AlertDescription>
          Cuando estés a {BOAT_RESERVATION_WINDOW_MINUTES} minutos de la náutica, tocá &quot;Llego en {BOAT_RESERVATION_WINDOW_MINUTES} minutos&quot;
          o indicá tu hora de llegada. El operador recibirá tu pedido y preparará la embarcación.
        </AlertDescription>
      </Alert>

      {embarcaciones.length === 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Sin embarcaciones</AlertTitle>
          <AlertDescription>
            No tenés embarcaciones en tu perfil. Completá &quot;Mi perfil&quot; antes de pedir tu lancha.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo pedido</CardTitle>
            <CardDescription>Seleccioná embarcación e indicá cuándo llegás</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {embarcaciones.length > 1 && (
              <div className="space-y-2">
                <Label>Embarcación</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedEmbId}
                  onChange={(e) => setSelectedEmbId(e.target.value)}
                >
                  {embarcaciones.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre || e.matricula || "Embarcación"}
                      {e.matricula && e.nombre ? ` (${e.matricula})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {embarcaciones.length === 1 && (
              <p className="text-sm">
                Embarcación: <strong>{embarcaciones[0].nombre || embarcaciones[0].matricula}</strong>
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="arrival">Hora de llegada estimada</Label>
              <Input
                id="arrival"
                type="datetime-local"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Máximo {BOAT_RESERVATION_MAX_FUTURE_MINUTES} minutos en el futuro. Podés enviar el pedido desde{" "}
                {BOAT_RESERVATION_WINDOW_MINUTES} min antes de esa hora.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                size="lg"
                className="flex-1 gap-2"
                disabled={submitting}
                onClick={() => submitReservation(true)}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clock className="h-4 w-4" />
                )}
                Llego en {BOAT_RESERVATION_WINDOW_MINUTES} minutos
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1 gap-2"
                disabled={submitting || !arrivalTime}
                onClick={() => submitReservation(false)}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirmar llegada programada
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loadingList ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pedidos activos</CardTitle>
                <CardDescription>Embarcaciones pendientes o en el agua</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {active.map(renderSolicitud)}
              </CardContent>
            </Card>
          )}

          {history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Historial reciente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {history.slice(0, 10).map(renderSolicitud)}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
