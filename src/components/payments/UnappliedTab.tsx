"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Mail, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type UnappliedItem = {
  id: string;
  period: string;
  paymentMethod: string;
  payerRaw: string;
  playerId: string | null;
  playerName: string | null;
  amount: number;
  currency: string;
  observation: string;
  importedAt: string;
};

const MONTHS = [
  { value: "01", label: "Enero" }, { value: "02", label: "Febrero" }, { value: "03", label: "Marzo" },
  { value: "04", label: "Abril" }, { value: "05", label: "Mayo" }, { value: "06", label: "Junio" },
  { value: "07", label: "Julio" }, { value: "08", label: "Agosto" }, { value: "09", label: "Septiembre" },
  { value: "10", label: "Octubre" }, { value: "11", label: "Noviembre" }, { value: "12", label: "Diciembre" },
];

function formatPeriod(period: string): string {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return period;
  const [y, m] = period.split("-");
  const monthName = MONTHS.find((x) => x.value === m)?.label ?? m;
  return `${monthName}-${y}`;
}

interface UnappliedTabProps {
  schoolId: string;
  getToken: () => Promise<string | null>;
}

export function UnappliedTab({ schoolId, getToken }: UnappliedTabProps) {
  const [items, setItems] = useState<UnappliedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPeriod, setFilterPeriod] = useState<string>("");
  const [filterObs, setFilterObs] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    if (!token) return;
    try {
      const params = new URLSearchParams({ schoolId });
      if (filterPeriod) params.set("period", filterPeriod);
      const res = await fetch(`/api/payments/unapplied?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId, filterPeriod, getToken]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filtered = filterObs
    ? items.filter((i) =>
        i.observation.toLowerCase().includes(filterObs.toLowerCase())
      )
    : items;

  const periods = [...new Set(items.map((i) => i.period))].sort().reverse();

  const handleSendEmailToAll = async () => {
    if (filtered.length === 0) {
      toast({ variant: "destructive", title: "No hay no aplicados para contactar." });
      return;
    }
    setSending(true);
    const token = await getToken();
    if (!token) {
      toast({ variant: "destructive", title: "No se pudo obtener sesión." });
      setSending(false);
      return;
    }
    try {
      const res = await fetch("/api/payments/send-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ schoolId, type: "unapplied" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Error al enviar");
      toast({
        title: "Correos encolados",
        description: data.message ?? `Se enviarán ${data.sent ?? 0} correos a clientes con pagos no aplicados.`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: e instanceof Error ? e.message : "Error al enviar correos",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterPeriod || "all"} onValueChange={(v) => setFilterPeriod(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los meses</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p} value={p}>
                {formatPeriod(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="text"
          placeholder="Filtrar por observación..."
          value={filterObs}
          onChange={(e) => setFilterObs(e.target.value)}
          className="rounded border px-2 py-1.5 text-sm w-56"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleSendEmailToAll}
          disabled={sending || filtered.length === 0}
        >
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}
          Enviar mail a todos los no aplicados
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          <AlertCircle className="mx-auto h-12 w-12 mb-2 opacity-50" />
          <p>No hay pagos no aplicados para mostrar.</p>
          <p className="text-sm mt-1">
            Los pagos con Aplicada=No se registran aquí con su observación al importar el Excel.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border min-w-0">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Cliente / Pagador</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Observación</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Importado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{formatPeriod(i.period)}</TableCell>
                  <TableCell>
                    {i.playerName ?? i.payerRaw}
                    {!i.playerId && i.payerRaw && (
                      <span className="text-xs text-muted-foreground block">(no vinculado)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {i.currency} {i.amount.toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={i.observation}>
                    {i.observation || "—"}
                  </TableCell>
                  <TableCell>{i.paymentMethod === "credit" ? "Crédito" : "Débito"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {i.importedAt ? format(new Date(i.importedAt), "dd/MM/yyyy HH:mm", { locale: es }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
