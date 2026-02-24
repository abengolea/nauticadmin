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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useCollection } from "@/firebase";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Payment, Player } from "@/lib/types";

/** Pago con nombre de jugador enriquecido por la API */
type PaymentWithPlayerName = Payment & { playerName?: string; requiereFactura?: boolean };

interface PaymentsTabProps {
  schoolId: string;
  getToken: () => Promise<string | null>;
  manualOpen?: boolean;
  onManualOpenChange?: (open: boolean) => void;
}

const STATUS_LABELS: Record<string, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  rejected: "Rechazado",
  refunded: "Reembolsado",
};

const PROVIDER_LABELS: Record<string, string> = {
  mercadopago: "MercadoPago",
  dlocal: "DLocal",
  manual: "Manual",
  excel_import: "Excel",
};

const REGISTRATION_PERIOD = "inscripcion";

/** Convierte "2026-02" → "FEBRERO-2026", "inscripcion" → "Inscripción", "ropa-1" → "Pago de ropa (1)" */
function formatPeriodDisplay(period: string): string {
  if (period === REGISTRATION_PERIOD) return "Inscripción";
  const ropaMatch = period.match(/^ropa-(\d+)$/);
  if (ropaMatch) return `Pago de ropa (${ropaMatch[1]})`;
  if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period;
  const [y, m] = period.split("-");
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  const monthName = format(date, "MMMM", { locale: es }).toUpperCase();
  return `${monthName}-${y}`;
}

const MONTHS: { value: string; label: string }[] = [
  { value: "01", label: "Enero" }, { value: "02", label: "Febrero" }, { value: "03", label: "Marzo" },
  { value: "04", label: "Abril" }, { value: "05", label: "Mayo" }, { value: "06", label: "Junio" },
  { value: "07", label: "Julio" }, { value: "08", label: "Agosto" }, { value: "09", label: "Septiembre" },
  { value: "10", label: "Octubre" }, { value: "11", label: "Noviembre" }, { value: "12", label: "Diciembre" },
];

const currentPeriod = () =>
  `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

/** Años desde 2026 en adelante (y los próximos años) */
function getYears(): number[] {
  const current = new Date().getFullYear();
  const start = 2026;
  const end = Math.max(current + 2, start + 2);
  const years: number[] = [];
  for (let y = end; y >= start; y--) {
    years.push(y);
  }
  return years;
}

export function PaymentsTab({ schoolId, getToken, manualOpen: manualOpenProp, onManualOpenChange }: PaymentsTabProps) {
  const [payments, setPayments] = useState<PaymentWithPlayerName[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    period: "",
    status: "",
    provider: "",
  });
  const [manualOpenLocal, setManualOpenLocal] = useState(false);
  const manualOpen = manualOpenProp ?? manualOpenLocal;
  const setManualOpen = onManualOpenChange ?? setManualOpenLocal;
  const [manualPlayerId, setManualPlayerId] = useState("");
  const [manualPeriod, setManualPeriod] = useState(currentPeriod());
  const [manualAmount, setManualAmount] = useState("15000");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [facturando, setFacturando] = useState(false);
  const [modoSimulacion, setModoSimulacion] = useState(true);
  const { toast } = useToast();

  const { data: players } = useCollection<Player>(
    schoolId ? `schools/${schoolId}/players` : "",
    { orderBy: ["lastName", "asc"] }
  );
  const activePlayers = (players ?? []).filter((p) => !p.archived);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    if (!token) return;
    const params = new URLSearchParams({ schoolId, limit: "500" });
    if (filters.period) params.set("period", filters.period);
    if (filters.status) params.set("status", filters.status);
    if (filters.provider) params.set("provider", filters.provider);
    try {
      const res = await fetch(`/api/payments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? data.error ?? "Error al cargar pagos");
      }
      const data = await res.json();
      setPayments(
        data.payments.map((p: PaymentWithPlayerName & { paidAt?: string; createdAt?: string }) => ({
          ...p,
          paidAt: p.paidAt ? new Date(p.paidAt) : undefined,
          createdAt: new Date(p.createdAt!),
        }))
      );
      setTotal(data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [schoolId, filters.period, filters.status, filters.provider, getToken]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(approvedFacturable.map((p) => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleFacturar = async () => {
    if (selectedIds.size === 0) {
      toast({ variant: "destructive", title: "Seleccioná al menos un pago para facturar." });
      return;
    }
    setFacturando(true);
    const token = await getToken();
    if (!token) {
      toast({ variant: "destructive", title: "No se pudo obtener sesión." });
      setFacturando(false);
      return;
    }
    try {
      const res = await fetch("/api/facturas/emit-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          paymentIds: Array.from(selectedIds),
          simulation: modoSimulacion,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Error al facturar");
      }
      const okCount = data.processed ?? 0;
      const failCount = data.failed ?? 0;
      const okResults = (data.results ?? []).filter((r: { ok: boolean }) => r.ok);
      const filenames = okResults.map((r: { filename?: string }) => r.filename).filter(Boolean) as string[];
      const failMsgs = (data.results ?? [])
        .filter((r: { ok: boolean; error?: string }) => !r.ok && r.error)
        .map((r: { error: string }) => r.error);
      if (okCount > 0 && filenames.length > 0) {
        toast({
          title: modoSimulacion ? `Simulación: ${okCount} factura(s) generada(s)` : `${okCount} factura(s) emitida(s) a AFIP`,
          description: failCount > 0 ? `${failCount} fallaron.` : "Hacé clic en 'Descargar' para abrir los PDF.",
          action: (
            <ToastAction
              altText="Descargar"
              onClick={async () => {
                const t = await getToken();
                if (!t) return;
                for (const fn of filenames) {
                  const r = await fetch(`/api/facturas/${fn}`, { headers: { Authorization: `Bearer ${t}` } });
                  const blob = await r.blob();
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = fn;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }
              }}
            >
              Descargar
            </ToastAction>
          ),
        });
      } else if (okCount > 0 && filenames.length === 0) {
        toast({
          variant: "destructive",
          title: "Error: las facturas no se guardaron",
          description: "El servidor reportó éxito pero no se generaron archivos. Revisá la consola del servidor.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "No se generó ninguna factura",
          description: failMsgs[0] ?? "Revisá la consola del servidor para más detalles.",
        });
      }
      if (failMsgs.length > 0) {
        failMsgs.slice(0, 3).forEach((msg: string) => toast({ variant: "destructive", title: "Error", description: msg }));
      }
      setSelectedIds(new Set());
      fetchPayments();
    } catch (e) {
      toast({
        variant: "destructive",
        title: e instanceof Error ? e.message : "Error al facturar",
      });
    } finally {
      setFacturando(false);
    }
  };

  const handleManualPayment = async () => {
    const amount = parseFloat(manualAmount);
    const period = manualPeriod;
    if (!manualPlayerId || Number.isNaN(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Completá cliente y monto válido." });
      return;
    }
    if (!manualPeriod) {
      toast({ variant: "destructive", title: "Completá el período para la cuota mensual." });
      return;
    }
    setManualSubmitting(true);
    const token = await getToken();
    if (!token) {
      toast({ variant: "destructive", title: "No se pudo obtener sesión." });
      setManualSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/payments/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          playerId: manualPlayerId,
          schoolId,
          period,
          amount,
          currency: "ARS",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Error al registrar pago");
      }
      toast({ title: "Pago registrado correctamente." });
      setManualOpen(false);
      setManualPlayerId("");
      setManualPeriod(currentPeriod());
      setManualAmount("15000");
      fetchPayments();
    } catch (e) {
      toast({
        variant: "destructive",
        title: e instanceof Error ? e.message : "Error al registrar pago",
      });
    } finally {
      setManualSubmitting(false);
    }
  };

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();
  const isInCurrentMonth = (p: Payment) => {
    const date = p.paidAt ?? p.createdAt;
    const ts = date.getTime();
    return ts >= currentMonthStart && ts <= currentMonthEnd;
  };
  const approvedInList = payments.filter((p) => p.status === "approved");
  const approvedFacturable = approvedInList.filter((p) => (p as PaymentWithPlayerName).requiereFactura !== false);
  const totalInList = approvedInList.reduce((s, p) => s + p.amount, 0);
  const approvedThisMonth = approvedInList.filter(isInCurrentMonth);
  const totalThisMonth = approvedThisMonth.reduce((s, p) => s + p.amount, 0);
  const currentMonthLabel = formatPeriodDisplay(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );

  const filterMonth = filters.period ? filters.period.slice(5, 7) : "all";
  const filterYear = filters.period ? filters.period.slice(0, 4) : "all";
  const setPeriodFromMonthYear = (month: string, year: string) => {
    if (month === "all" || year === "all" || !month || !year) {
      setFilters((f) => ({ ...f, period: "" }));
      return;
    }
    setFilters((f) => ({ ...f, period: `${year}-${month}` }));
  };

  return (
    <div className="space-y-4 min-w-0">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Pagos aprobados en lista</p>
          <p className="text-2xl font-bold">
            {loading ? "Cargando…" : approvedInList.length}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total en lista</p>
          <p className="text-2xl font-bold">
            {loading ? "Cargando…" : `ARS ${totalInList.toLocaleString("es-AR")}`}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Mes en curso ({currentMonthLabel})</p>
          <p className="text-2xl font-bold">
            {loading ? "Cargando…" : `${approvedThisMonth.length} pagos`}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total mes en curso</p>
          <p className="text-2xl font-bold">
            {loading ? "Cargando…" : `ARS ${totalThisMonth.toLocaleString("es-AR")}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filterMonth}
          onValueChange={(v) =>
            setPeriodFromMonthYear(v, filterYear === "all" ? String(new Date().getFullYear()) : filterYear)
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {MONTHS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterYear}
          onValueChange={(v) =>
            setPeriodFromMonthYear(
              filterMonth === "all" ? String(new Date().getMonth() + 1).padStart(2, "0") : filterMonth,
              v
            )
          }
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {getYears().map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.status}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.provider}
          onValueChange={(v) => setFilters((f) => ({ ...f, provider: v }))}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PROVIDER_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {approvedFacturable.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:border-l sm:pl-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
              <Checkbox
                checked={modoSimulacion}
                onCheckedChange={(c) => setModoSimulacion(c === true)}
              />
              <span className="text-muted-foreground text-xs sm:text-sm">Simulación</span>
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFacturar}
              disabled={facturando || selectedIds.size === 0}
            >
              {facturando ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Facturar ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-md border bg-muted/30">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Cargando pagos…</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border min-w-0">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-2">
                  <Checkbox
                    checked={selectedIds.size === approvedFacturable.length && approvedFacturable.length > 0}
                    onCheckedChange={(c) => toggleSelectAll(c === true)}
                  />
                </TableHead>
                <TableHead className="text-xs sm:text-sm whitespace-nowrap">Período</TableHead>
                <TableHead className="text-xs sm:text-sm">Cliente</TableHead>
                <TableHead className="text-xs sm:text-sm">Monto</TableHead>
                <TableHead className="text-xs sm:text-sm">Proveedor</TableHead>
                <TableHead className="text-xs sm:text-sm">Estado</TableHead>
                <TableHead className="text-xs sm:text-sm whitespace-nowrap">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No hay pagos para mostrar
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="w-10 px-2">
                      {p.status === "approved" && (p as PaymentWithPlayerName).requiereFactura !== false ? (
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                        />
                      ) : p.status === "approved" ? (
                        <span className="text-xs text-muted-foreground" title="Cliente marcado como no facturar">—</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{formatPeriodDisplay(p.period)}</TableCell>
                    <TableCell>
                      <span>{p.playerName ?? p.playerId}</span>
                      {p.status === "approved" && (p as PaymentWithPlayerName).requiereFactura === false && (
                        <Badge variant="secondary" className="ml-1 text-xs">No factura</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.currency} {p.amount.toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell>
                      {p.provider === "manual"
                        ? (p.metadata as { collectedByDisplayName?: string; collectedByEmail?: string } | undefined)
                            ?.collectedByDisplayName ||
                          (p.metadata as { collectedByEmail?: string } | undefined)?.collectedByEmail ||
                          "Manual"
                        : PROVIDER_LABELS[p.provider] ?? p.provider}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === "approved"
                            ? "default"
                            : p.status === "rejected"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.paidAt
                        ? format(p.paidAt, "dd/MM/yyyy HH:mm", { locale: es })
                        : format(p.createdAt, "dd/MM/yyyy", { locale: es })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago manual</DialogTitle>
            <DialogDescription>
              Simulá o registrá un pago realizado fuera del sistema (efectivo, transferencia, etc.).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="manual-player">Cliente</Label>
              <Select value={manualPlayerId} onValueChange={setManualPlayerId}>
                <SelectTrigger id="manual-player" className="mt-1">
                  <SelectValue placeholder="Elegí un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {activePlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {[p.firstName, p.lastName].filter(Boolean).join(" ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="manual-period">Período (YYYY-MM)</Label>
              <Input
                id="manual-period"
                value={manualPeriod}
                onChange={(e) => setManualPeriod(e.target.value)}
                placeholder="2026-02"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="manual-amount">Monto (ARS)</Label>
              <Input
                id="manual-amount"
                type="number"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="15000"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleManualPayment}
              disabled={manualSubmitting}
            >
              {manualSubmitting ? "Guardando…" : "Registrar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
