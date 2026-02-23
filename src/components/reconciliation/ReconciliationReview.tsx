"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useUser } from "@/firebase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  GitMerge,
  Loader2,
  Search,
  CheckSquare,
  RefreshCw,
  UserPlus,
  Download,
  ChevronDown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RecPayment, RecMatch, RecClient } from "@/lib/reconciliation/types";
import { normalizeAndTokenize } from "@/lib/reconciliation/normalize";
import { tokenSetRatio } from "@/lib/reconciliation/scoring";

type TabKey = "auto" | "review" | "nomatch" | "conflict";

/** Encuentra el cliente sugerido cuando cliente_raw coincide con un único cliente (score ≥ 90). */
function findSuggestedPlayerId(
  clienteRaw: string,
  players: PlayerOption[]
): string | null {
  if (!clienteRaw?.trim() || !players.length) return null;
  const { tokens: clienteTokens } = normalizeAndTokenize(clienteRaw);
  if (clienteTokens.length === 0) return null;
  const matches = players
    .map((p) => {
      const { tokens } = normalizeAndTokenize(p.displayName);
      const score = tokenSetRatio(clienteTokens, tokens);
      return { id: p.id, score };
    })
    .filter((m) => m.score >= 90)
    .sort((a, b) => b.score - a.score);
  return matches.length === 1 ? matches[0].id : null;
}

function normForSearch(s: string): string {
  return (s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Selector de cliente con buscador. */
function ClientSelectCombobox({
  value,
  onChange,
  players,
  placeholder = "Elegir cliente…",
  disabled,
}: {
  value: string;
  onChange: (playerId: string) => void;
  players: PlayerOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selectedPlayer = players.find((p) => p.id === value);
  const displayLabel = selectedPlayer?.displayName ?? placeholder;

  const filtered = React.useMemo(() => {
    const q = normForSearch(query);
    if (!q) return players;
    return players.filter((p) => normForSearch(p.displayName).includes(q));
  }, [players, query]);

  const handleSelect = (playerId: string) => {
    onChange(playerId);
    setOpen(false);
    setQuery("");
  };

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="min-w-[200px] justify-between font-normal"
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Buscar cliente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-9"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <ScrollArea className="h-[max(200px,min(300px,60vh))]">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados</p>
          ) : (
            <div className="p-1">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent rounded-md ${selectedPlayer?.id === p.id ? "bg-accent" : ""}`}
                  onClick={() => handleSelect(p.id)}
                >
                  {p.displayName}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

type PendingAlias = { id: string; pagador_raw: string; cliente_raw: string; created_at: string };
type PlayerOption = { id: string; displayName: string };

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "auto", label: "Auto-imputados", icon: CheckCircle2 },
  { key: "review", label: "Revisar", icon: AlertCircle },
  { key: "nomatch", label: "Sin match", icon: XCircle },
  { key: "conflict", label: "Conflictos", icon: GitMerge },
];

export function ReconciliationReview({
  schoolId,
  initialBatchId,
}: {
  schoolId: string;
  initialBatchId?: string | null;
}) {
  const { user } = useUser();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("review");
  const [importBatchId, setImportBatchId] = useState<string | null>(initialBatchId ?? null);
  const [batches, setBatches] = useState<Array<{ id: string; created_at: string; payments_count: number }>>([]);
  const [items, setItems] = useState<Array<RecPayment & { match?: RecMatch }>>([]);
  const [clients, setClients] = useState<RecClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterApellido, setFilterApellido] = useState("");
  const [filterImporteMin, setFilterImporteMin] = useState("");
  const [filterImporteMax, setFilterImporteMax] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [pendingAliases, setPendingAliases] = useState<PendingAlias[]>([]);
  const [pendingPlayers, setPendingPlayers] = useState<PlayerOption[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingSeedLoading, setPendingSeedLoading] = useState(false);
  const [confirmingPending, setConfirmingPending] = useState<string | null>(null);
  const [selectedClientByAlias, setSelectedClientByAlias] = useState<Record<string, string>>({});

  const fetchBatches = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/reconciliation/batches?schoolId=${encodeURIComponent(schoolId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setBatches(data.batches ?? []);
        if (data.batches?.length > 0 && !importBatchId) {
          setImportBatchId(data.batches[0].id);
        }
      }
    } catch {
      setBatches([]);
    }
  }, [user, schoolId, importBatchId]);

  const fetchList = useCallback(
    async (cacheBust?: boolean) => {
      if (!user || !schoolId) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          schoolId,
          tab,
          ...(importBatchId && { importBatchId }),
          ...(filterApellido && { apellido: filterApellido }),
          ...(filterImporteMin && { importeMin: filterImporteMin }),
          ...(filterImporteMax && { importeMax: filterImporteMax }),
          ...(cacheBust && { _: Date.now().toString() }),
        });
        const token = await user.getIdToken();
        const res = await fetch(`/api/reconciliation/list?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setClients(data.clients ?? []);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  },
    [user, schoolId, tab, importBatchId, filterApellido, filterImporteMin, filterImporteMax]
  );

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    if (initialBatchId) setImportBatchId(initialBatchId);
  }, [initialBatchId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    setSelected(new Set());
  }, [tab, importBatchId]);

  const fetchPendingAliases = useCallback(async (skipClearOnError = false) => {
    if (!user || !schoolId) return;
    setPendingLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/reconciliation/pending-aliases?schoolId=${encodeURIComponent(schoolId)}&_=${Date.now()}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        setPendingAliases(data.items ?? []);
        setPendingPlayers(data.players ?? []);
      } else if (!skipClearOnError) {
        setPendingAliases([]);
        setPendingPlayers([]);
      }
    } catch {
      if (!skipClearOnError) {
        setPendingAliases([]);
        setPendingPlayers([]);
      }
    } finally {
      setPendingLoading(false);
    }
  }, [user, schoolId]);

  useEffect(() => {
    if (tab === "nomatch") fetchPendingAliases();
  }, [tab, fetchPendingAliases]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const pa of pendingAliases) {
      const suggested = findSuggestedPlayerId(pa.cliente_raw, pendingPlayers);
      if (suggested) next[pa.id] = suggested;
    }
    setSelectedClientByAlias((prev) => {
      const merged = { ...next };
      for (const pa of pendingAliases) {
        if (prev[pa.id] && !merged[pa.id]) merged[pa.id] = prev[pa.id];
      }
      return merged;
    });
  }, [pendingAliases, pendingPlayers]);

  const handleSeedPending = async () => {
    if (!user || !schoolId) return;
    setPendingSeedLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/reconciliation/seed-pending-aliases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ schoolId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Listo", description: data.message ?? `${data.saved} cargados` });
        await new Promise((r) => setTimeout(r, 300));
        await fetchPendingAliases(true);
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error ?? "Error" });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: String(e) });
    } finally {
      setPendingSeedLoading(false);
    }
  };

  const handleConfirmPending = async (pendingId: string, playerId: string) => {
    if (!user) return;
    setConfirmingPending(pendingId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/reconciliation/confirm-pending-alias", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ schoolId, pendingId, playerId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Confirmado", description: "Se guardó el alias para futuras importaciones." });
        await fetchPendingAliases();
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error ?? "Error" });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: String(e) });
    } finally {
      setConfirmingPending(null);
    }
  };

  const handleBulkConfirmPending = async () => {
    if (!user || !schoolId) return;
    const toConfirm: { id: string; playerId: string }[] = [];
    for (const pa of pendingAliases) {
      const playerId = selectedClientByAlias[pa.id]?.trim();
      if (playerId) toConfirm.push({ id: pa.id, playerId });
    }
    if (toConfirm.length === 0) {
      toast({ variant: "destructive", title: "Elegí al menos un cliente en cada fila" });
      return;
    }
    setConfirmingPending("bulk");
    let ok = 0;
    let err = 0;
    try {
      const token = await user.getIdToken();
      for (const { id, playerId } of toConfirm) {
        const res = await fetch("/api/reconciliation/confirm-pending-alias", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ schoolId, pendingId: id, playerId }),
        });
        if (res.ok) ok++;
        else err++;
      }
      toast({
        title: "Listo",
        description: err > 0 ? `${ok} confirmados, ${err} fallaron` : `${ok} alias confirmados`,
      });
      await fetchPendingAliases();
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: String(e) });
    } finally {
      setConfirmingPending(null);
    }
  };

  const toggleSelect = (paymentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const confirmable = items.filter(
      (i) => i.match_status === "pending" && i.match?.top_candidates?.length > 0
    );
    const allSelected = confirmable.every((i) => selected.has(i.payment_id));
    setSelected(allSelected ? new Set() : new Set(confirmable.map((i) => i.payment_id)));
  };

  const selectedCount = items.filter((i) => selected.has(i.payment_id)).length;
  const selectedWithCandidate = items.filter(
    (i) => selected.has(i.payment_id) && i.match?.top_candidates?.length > 0
  );

  const handleBulkConfirm = async () => {
    if (!user || selectedWithCandidate.length === 0) return;
    setBulkProcessing(true);
    let ok = 0;
    let err = 0;
    try {
      const token = await user.getIdToken();
      await Promise.all(
        selectedWithCandidate.map(async (item) => {
          const clientId = item.match!.top_candidates[0]!.client_id;
          const res = await fetch("/api/reconciliation/confirm", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              schoolId,
              paymentId: item.payment_id,
              action: "confirm",
              clientId,
            }),
          });
          if (res.ok) ok++;
          else err++;
        })
      );
      const msg = err > 0 ? `${ok} confirmados, ${err} fallaron` : `${ok} confirmados`;
      toast({ title: "Listo", description: msg });
      setSelected(new Set());
      await fetchList(true);
      fetchBatches();
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: String(e) });
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkReject = async () => {
    if (!user || selectedCount === 0) return;
    setBulkProcessing(true);
    let ok = 0;
    let err = 0;
    try {
      const token = await user.getIdToken();
      const toReject = items.filter((i) => selected.has(i.payment_id));
      await Promise.all(
        toReject.map(async (item) => {
          const res = await fetch("/api/reconciliation/confirm", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              schoolId,
              paymentId: item.payment_id,
              action: "reject",
              rejectedReason: "No corresponde",
            }),
          });
          if (res.ok) ok++;
          else err++;
        })
      );
      const msg = err > 0 ? `${ok} rechazados, ${err} fallaron` : `${ok} rechazados`;
      toast({ title: "Listo", description: msg });
      setSelected(new Set());
      await fetchList(true);
      fetchBatches();
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: String(e) });
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleConfirm = async (paymentId: string, clientId: string) => {
    if (!user) return;
    setConfirming(paymentId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/reconciliation/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          paymentId,
          action: "confirm",
          clientId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error");
      }
      toast({ title: "Confirmado", description: "Se guardó el alias para futuras importaciones." });
      await fetchList(true);
      fetchBatches();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setConfirming(null);
    }
  };

  const handleReject = async (paymentId: string) => {
    if (!user) return;
    setConfirming(paymentId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/reconciliation/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          paymentId,
          action: "reject",
          rejectedReason: "No corresponde",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error");
      }
      toast({ title: "Rechazado" });
      await fetchList(true);
      fetchBatches();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setConfirming(null);
    }
  };

  const clientsById = new Map(clients.map((c) => [c.client_id, c]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conciliación</CardTitle>
        <CardDescription>
          Revisá los pagos no imputados automáticamente. Confirmá para guardar alias y auto-imputar la próxima vez.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {batches.length > 0 && (
          <div>
            <label className="text-sm font-medium block mb-1">Lote de importación</label>
            <select
              value={importBatchId ?? ""}
              onChange={(e) => setImportBatchId(e.target.value || null)}
              className="rounded border bg-background px-2 py-1.5 text-sm"
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {new Date(b.created_at).toLocaleString("es-AR")} ({b.payments_count} pagos)
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Apellido contiene..."
              value={filterApellido}
              onChange={(e) => setFilterApellido(e.target.value)}
              className="rounded border px-2 py-1 text-sm w-40"
            />
          </div>
          <input
            type="number"
            placeholder="Importe mín"
            value={filterImporteMin}
            onChange={(e) => setFilterImporteMin(e.target.value)}
            className="rounded border px-2 py-1 text-sm w-24"
          />
          <input
            type="number"
            placeholder="Importe máx"
            value={filterImporteMax}
            onChange={(e) => setFilterImporteMax(e.target.value)}
            className="rounded border px-2 py-1 text-sm w-24"
          />
          <Button size="sm" variant="outline" onClick={() => fetchList()}>
            Filtrar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fetchList(true)}
            title="Actualizar lista"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid w-full grid-cols-4">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-1 text-xs">
                <t.icon className="h-3 w-3" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="mt-4">
            {loading && tab !== "nomatch" ? (
              <div className="flex items-center gap-2 py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
                Cargando…
              </div>
            ) : tab === "nomatch" ? (
              <div className="space-y-6">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 py-3 px-4 -mx-4 -mt-2 mb-2 bg-background border rounded-lg border-border">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      Alias pendientes (Pagador → Cliente)
                    </p>
                    <p className="text-sm text-muted-foreground">
                      El pagador es el nombre en la transferencia; el cliente es el socio. Si hay coincidencia única, se pre-selecciona. Solo confirmá con Asignar.
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {pendingAliases.length > 0 && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleBulkConfirmPending}
                        disabled={confirmingPending === "bulk" || pendingLoading}
                        className="gap-1"
                      >
                        {confirmingPending === "bulk" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckSquare className="h-4 w-4" />
                        )}
                        Confirmar todos
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="default"
                      onClick={handleSeedPending}
                      disabled={pendingSeedLoading || pendingLoading}
                      className="gap-1"
                    >
                      {pendingSeedLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Cargar pendientes
                    </Button>
                  </div>
                </div>
                {loading ? (
                  <div className="flex items-center gap-2 py-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Cargando pagos…
                  </div>
                ) : items.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 pb-2 border-b">
                      <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={
                            items.filter((i) => i.match_status === "pending").length > 0 &&
                            items
                              .filter((i) => i.match_status === "pending")
                              .every((i) => selected.has(i.payment_id))
                          }
                          onCheckedChange={toggleSelectAll}
                        />
                        Marcar todos
                      </label>
                      {selectedCount > 0 && (
                        <>
                          <span className="text-sm text-muted-foreground">
                            {selectedCount} seleccionado{selectedCount !== 1 ? "s" : ""}
                          </span>
                          <Button
                            size="sm"
                            onClick={handleBulkConfirm}
                            disabled={bulkProcessing || selectedWithCandidate.length === 0}
                            className="gap-1"
                          >
                            {bulkProcessing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <CheckSquare className="h-4 w-4" />
                                Confirmar {selectedWithCandidate.length} con 1º candidato
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleBulkReject}
                            disabled={bulkProcessing}
                          >
                            Rechazar {selectedCount}
                          </Button>
                        </>
                      )}
                    </div>
                    <p className="text-sm font-medium">Pagos sin match</p>
                    {items.map((item) => (
                      <div key={item.payment_id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          {item.match_status === "pending" && (
                            <div className="flex-shrink-0 pt-0.5">
                              <Checkbox
                                checked={selected.has(item.payment_id)}
                                onCheckedChange={() => toggleSelect(item.payment_id)}
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{item.payer_raw}</p>
                            <p className="text-sm text-muted-foreground">
                              ${item.amount.toLocaleString("es-AR")} • {item.nro_tarjeta} • Id: {item.id_usuario}
                            </p>
                            {item.match && (
                              <p className="text-xs text-muted-foreground mt-1">{item.match.explanation}</p>
                            )}
                          </div>
                          {item.match_status === "pending" && (
                            <div className="flex-shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReject(item.payment_id)}
                                disabled={confirming === item.payment_id}
                              >
                                Rechazar
                              </Button>
                            </div>
                          )}
                        </div>
                        {item.match && item.match.top_candidates.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium">Candidatos:</p>
                            <div className="flex flex-wrap gap-2">
                              {item.match.top_candidates.map((c) => (
                                <Button
                                  key={c.client_id}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleConfirm(item.payment_id, c.client_id)}
                                  disabled={confirming === item.payment_id}
                                >
                                  {c.client_name_raw} ({c.score})
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="border-t pt-6">
                  {pendingLoading ? (
                    <div className="flex items-center gap-2 py-6">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Cargando alias pendientes…
                    </div>
                  ) : pendingAliases.length === 0 ? (
                    <p className="text-muted-foreground py-6 text-sm">
                      No hay alias pendientes. Cargá desde Excel (Importar) o usá &quot;Cargar pendientes&quot; para la lista predefinida.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {pendingAliases.map((pa) => (
                        <div
                          key={pa.id}
                          className="border rounded-lg p-4 flex flex-wrap items-center gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{pa.pagador_raw}</p>
                            <p className="text-sm text-muted-foreground">Cliente: {pa.cliente_raw}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <ClientSelectCombobox
                              value={selectedClientByAlias[pa.id] ?? ""}
                              onChange={(playerId) =>
                                setSelectedClientByAlias((prev) => ({ ...prev, [pa.id]: playerId }))
                              }
                              players={pendingPlayers}
                              disabled={confirmingPending === pa.id || confirmingPending === "bulk"}
                            />
                            <Button
                              size="sm"
                              onClick={() => {
                                const playerId = selectedClientByAlias[pa.id];
                                if (playerId) handleConfirmPending(pa.id, playerId);
                                else toast({ variant: "destructive", title: "Elegí un cliente" });
                              }}
                              disabled={confirmingPending === pa.id || confirmingPending === "bulk"}
                            >
                              {confirmingPending === pa.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Asignar"
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {items.length === 0 && pendingAliases.length === 0 && !pendingLoading && !loading ? (
                  <p className="text-muted-foreground py-8">No hay pagos ni alias pendientes.</p>
                ) : null}
              </div>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground py-8">No hay items en esta pestaña.</p>
            ) : (
              <div className="space-y-4">
                {tab !== "auto" && (
                  <div className="flex flex-wrap items-center gap-2 pb-2 border-b">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={
                          items.filter((i) => i.match_status === "pending").length > 0 &&
                          items
                            .filter((i) => i.match_status === "pending")
                            .every((i) => selected.has(i.payment_id))
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                      Marcar todos
                    </label>
                    {selectedCount > 0 && (
                      <>
                        <span className="text-sm text-muted-foreground">
                          {selectedCount} seleccionado{selectedCount !== 1 ? "s" : ""}
                        </span>
                        <Button
                          size="sm"
                          onClick={handleBulkConfirm}
                          disabled={
                            bulkProcessing ||
                            selectedWithCandidate.length === 0
                          }
                          title={
                            selectedWithCandidate.length === 0
                              ? "Seleccioná pagos que tengan candidatos"
                              : undefined
                          }
                          className="gap-1"
                        >
                          {bulkProcessing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckSquare className="h-4 w-4" />
                              Confirmar {selectedWithCandidate.length} con 1º candidato
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleBulkReject}
                          disabled={bulkProcessing}
                        >
                          Rechazar {selectedCount}
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {items.map((item) => (
                  <div
                    key={item.payment_id}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex justify-between items-start gap-2">
                      {tab !== "auto" && item.match_status === "pending" && (
                        <div className="flex-shrink-0 pt-0.5">
                          <Checkbox
                            checked={selected.has(item.payment_id)}
                            onCheckedChange={() => toggleSelect(item.payment_id)}
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{item.payer_raw}</p>
                        <p className="text-sm text-muted-foreground">
                          ${item.amount.toLocaleString("es-AR")} • {item.nro_tarjeta} • Id: {item.id_usuario}
                        </p>
                        {item.match && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.match.explanation}
                          </p>
                        )}
                      </div>
                      {tab !== "auto" && item.match_status === "pending" && (
                        <div className="flex-shrink-0">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReject(item.payment_id)}
                              disabled={confirming === item.payment_id}
                            >
                              Rechazar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    {tab !== "auto" &&
                      item.match &&
                      item.match.top_candidates.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Candidatos:</p>
                          <div className="flex flex-wrap gap-2">
                            {item.match.top_candidates.map((c) => (
                              <Button
                                key={c.client_id}
                                size="sm"
                                variant="secondary"
                                onClick={() => handleConfirm(item.payment_id, c.client_id)}
                                disabled={confirming === item.payment_id}
                              >
                                {c.client_name_raw} ({c.score})
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
