"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useUser, useCollection } from "@/firebase";
import type { Player } from "@/lib/types";
import { ClientSelectCombobox } from "@/components/players/ClientSelectCombobox";
import { buildPersistedAliasNames } from "@/lib/reconciliacion-excel/save-player-alias";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  UserCheck,
  ClipboardList,
  Link2,
  Undo2,
  UserPlus,
} from "lucide-react";
import { PAYMENT_FILE_KIND_LABEL } from "@/lib/reconciliacion-excel/types";
import type { ImputePaymentItem } from "@/lib/reconciliacion-excel/types";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ReconciliationResult,
  RelationRow,
} from "@/lib/reconciliacion-excel/types";

type DoubtfulEntry = {
  paymentRowId: string;
  payerRaw: string;
  amount: number;
  targetName: string;
  suggestedPlayerId: string;
  suggestedPlayerName: string;
  score: number;
};

type NotFoundEntry = {
  paymentRowId: string;
  payerRaw: string;
  amount: number;
  targetName: string;
  accountRaw: string;
};

/** Fila unificada: sin match o match fuzzy pendiente de confirmar */
type PendingImputeRow = {
  paymentRowId: string;
  payerRaw: string;
  amount: number;
  targetName: string;
  accountRaw?: string;
  suggestedPlayerId?: string;
  suggestedPlayerName?: string;
  score?: number;
  kind: "notfound" | "doubtful";
};

const SUGGESTED_PLAYER_SCORE = 0.92;

function formatPeriodLabel(period: string): string {
  const [y, m] = period.split("-");
  if (!y || !m) return period;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

function WorkflowStep({
  step,
  label,
  status,
}: {
  step: number;
  label: string;
  status: "done" | "current" | "upcoming";
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          status === "done"
            ? "bg-primary text-primary-foreground"
            : status === "current"
              ? "border-2 border-primary text-primary"
              : "border border-muted-foreground/30 text-muted-foreground"
        }`}
      >
        {status === "done" ? <CheckCircle2 className="h-4 w-4" /> : step}
      </div>
      <span
        className={`text-sm truncate ${
          status === "current" ? "font-medium" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

type ImputeSummary = {
  applied: number;
  already: number;
  alreadyPaidPeriod?: number;
  period?: string;
  notFoundCount: number;
  notFound: string[];
  notFoundItems?: NotFoundEntry[];
  skippedCount: number;
  skipped: string[];
  doubtful?: DoubtfulEntry[];
  doubtfulCount?: number;
  pendingDoubtfulCount?: number;
  totalAmount?: number;
  simulate?: boolean;
  wouldApply?: Array<{
    paymentRowId?: string;
    payerRaw: string;
    amount: number;
    playerName: string;
  }>;
  message: string;
};

type SessionSavePayload = {
  manualResolved: Record<string, string>;
  manualPlayerAssignments: Record<string, string>;
  imputedCount: number;
  pendingAssignCount: number;
  totalConciliated: number;
};

type ReconciliationResultsProps = {
  schoolId: string;
  results: ReconciliationResult[];
  relations: RelationRow[];
  imputePeriod: string;
  initialManualResolved?: Record<string, string>;
  initialManualPlayerAssignments?: Record<string, string>;
  onSaveSession?: (payload: SessionSavePayload) => Promise<void>;
};

export function ReconciliationResults({
  schoolId,
  results,
  relations,
  imputePeriod,
  initialManualResolved = {},
  initialManualPlayerAssignments = {},
  onSaveSession,
}: ReconciliationResultsProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [manualSelections, setManualSelections] = useState<Record<string, string>>({});
  /** Pagador → cliente del listado, solo para esta conciliación */
  const [manualResolved, setManualResolved] = useState<Record<string, string>>(
    initialManualResolved
  );
  const [confirmImpute, setConfirmImpute] = useState(false);
  const [imputing, setImputing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [imputeSummary, setImputeSummary] = useState<ImputeSummary | null>(null);
  /** paymentRowId → playerId asignado manualmente en NauticAdmin */
  const [manualPlayerAssignments, setManualPlayerAssignments] = useState<
    Record<string, string>
  >(initialManualPlayerAssignments);
  const [playerPicks, setPlayerPicks] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const { data: players } = useCollection<Player>(
    schoolId ? `schools/${schoolId}/players` : "",
    { orderBy: ["lastName", "asc"] }
  );
  const playerOptions = useMemo(
    () =>
      (players ?? [])
        .filter((p) => !p.archived)
        .map((p) => ({
          id: p.id,
          displayName:
            [p.lastName, p.firstName].filter(Boolean).join(", ").trim() ||
            p.email ||
            p.id,
        })),
    [players]
  );

  const matched = results.filter((r) => r.status === "MATCHED");
  const doubtfulList = imputeSummary?.doubtful ?? [];
  const review = results.filter((r) => r.status === "REVIEW");
  const unmatched = results.filter((r) => r.status === "UNMATCHED");

  type ResolvedRow = ReconciliationResult & {
    effectiveAccountKey: string;
    isManual: boolean;
  };

  const allResolved = useMemo((): ResolvedRow[] => {
    const auto: ResolvedRow[] = matched
      .filter((r) => r.matchedAccountKey)
      .map((r) => ({
        ...r,
        effectiveAccountKey: r.matchedAccountKey!,
        isManual: false,
      }));
    const manualSources = [...review, ...unmatched];
    const manual: ResolvedRow[] = manualSources
      .filter((r) => manualResolved[r.paymentRowId])
      .map((r) => ({
        ...r,
        effectiveAccountKey: manualResolved[r.paymentRowId],
        isManual: true,
      }));
    return [...auto, ...manual];
  }, [matched, review, unmatched, manualResolved]);

  const openReview = review.filter((r) => !manualResolved[r.paymentRowId]);
  const openUnmatched = unmatched.filter((r) => !manualResolved[r.paymentRowId]);
  const pendingManualCount = openReview.length + openUnmatched.length;

  const handleManualSelect = useCallback((rowId: string, accountKey: string) => {
    setManualSelections((prev) => ({ ...prev, [rowId]: accountKey }));
  }, []);

  const getAccountRaw = (accountKey: string) =>
    relations.find((r) => r.accountKey === accountKey)?.accountRaw ?? accountKey;

  const findRelationForAccount = (accountKey: string, cardLast4?: string) =>
    relations.find(
      (rel) =>
        rel.accountKey === accountKey &&
        (!rel.cardLast4 || !cardLast4 || rel.cardLast4 === cardLast4)
    ) ?? relations.find((rel) => rel.accountKey === accountKey);

  const handleManualResolve = useCallback(
    (r: ReconciliationResult, accountKey: string) => {
      if (!accountKey) {
        toast({ variant: "destructive", title: "Elegí el cliente del listado (col G)" });
        return;
      }
      setManualResolved((prev) => ({ ...prev, [r.paymentRowId]: accountKey }));
      setManualSelections((prev) => {
        const next = { ...prev };
        delete next[r.paymentRowId];
        return next;
      });
      setImputeSummary(null);
      toast({
        title: "Conciliado",
        description: `${r.payerRaw} → ${getAccountRaw(accountKey)}`,
      });
    },
    [toast, relations]
  );

  const handleUndoManual = useCallback((paymentRowId: string) => {
    setManualResolved((prev) => {
      const next = { ...prev };
      delete next[paymentRowId];
      return next;
    });
    setImputeSummary(null);
  }, []);

  const formatAmount = (n: number) =>
    `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const resolvedTotal = allResolved.reduce((s, r) => s + (r.amount ?? 0), 0);
  const manualResolvedCount = allResolved.filter((r) => r.isManual).length;

  const buildImputeItems = useCallback((): ImputePaymentItem[] => {
    return allResolved
      .filter((r) => (r.amount ?? 0) > 0)
      .map((r) => {
        const rel = findRelationForAccount(r.effectiveAccountKey, r.cardLast4);
        return {
          paymentRowId: r.paymentRowId,
          payerRaw: r.payerRaw,
          amount: r.amount ?? 0,
          accountKey: r.effectiveAccountKey,
          accountRaw: rel?.accountRaw ?? getAccountRaw(r.effectiveAccountKey),
          sourceKind: r.sourceKind,
          aplicada: r.aplicada,
          cardLast4: r.cardLast4,
          dni: rel?.dni,
          listadoLastName: rel?.listadoLastName,
          listadoFirstName: rel?.listadoFirstName,
          imputeToRaw: rel?.imputeToRaw,
          playerIdOverride: manualPlayerAssignments[r.paymentRowId],
        };
      });
  }, [allResolved, relations, manualPlayerAssignments]);

  const imputeItemsById = useMemo(() => {
    const map = new Map<string, ImputePaymentItem>();
    for (const item of buildImputeItems()) {
      map.set(item.paymentRowId, item);
    }
    return map;
  }, [buildImputeItems]);

  const notFoundPending = useMemo(() => {
    const items = imputeSummary?.notFoundItems ?? [];
    return items.filter((row) => !manualPlayerAssignments[row.paymentRowId]);
  }, [imputeSummary, manualPlayerAssignments]);

  const persistSessionState = useCallback(
    async (pendingCount: number, imputedCount: number) => {
      if (!onSaveSession) return;
      await onSaveSession({
        manualResolved,
        manualPlayerAssignments,
        imputedCount,
        pendingAssignCount: pendingCount,
        totalConciliated: allResolved.length,
      });
    },
    [onSaveSession, manualResolved, manualPlayerAssignments, allResolved.length]
  );

  const pendingImputeRows = useMemo((): PendingImputeRow[] => {
    const rows: PendingImputeRow[] = [];
    const seen = new Set<string>();

    for (const d of doubtfulList) {
      if (manualPlayerAssignments[d.paymentRowId]) continue;
      rows.push({
        paymentRowId: d.paymentRowId,
        payerRaw: d.payerRaw,
        amount: d.amount,
        targetName: d.targetName,
        suggestedPlayerId: d.suggestedPlayerId,
        suggestedPlayerName: d.suggestedPlayerName,
        score: d.score,
        kind: "doubtful",
      });
      seen.add(d.paymentRowId);
    }

    for (const n of notFoundPending) {
      if (seen.has(n.paymentRowId)) continue;
      rows.push({
        paymentRowId: n.paymentRowId,
        payerRaw: n.payerRaw,
        amount: n.amount,
        targetName: n.targetName,
        accountRaw: n.accountRaw,
        kind: "notfound",
      });
    }

    return rows.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "doubtful" ? -1 : 1;
      return (b.score ?? 0) - (a.score ?? 0);
    });
  }, [doubtfulList, notFoundPending, manualPlayerAssignments]);

  useEffect(() => {
    setImputeSummary(null);
  }, [imputePeriod]);

  useEffect(() => {
    if (!imputeSummary) return;
    setPlayerPicks((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of pendingImputeRows) {
        if (next[row.paymentRowId]) continue;
        if (
          row.suggestedPlayerId &&
          (row.score ?? 0) >= SUGGESTED_PLAYER_SCORE
        ) {
          next[row.paymentRowId] = row.suggestedPlayerId;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [imputeSummary, pendingImputeRows]);

  const runSimulate = useCallback(
    async (items: ImputePaymentItem[]) => {
      if (!user) {
        toast({ variant: "destructive", title: "Tenés que iniciar sesión" });
        return;
      }
      if (items.length === 0) {
        toast({ variant: "destructive", title: "No hay pagos conciliados para simular" });
        return;
      }
      setSimulating(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/reconciliacion-excel/simulate-impute?schoolId=${encodeURIComponent(schoolId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              items,
              period: imputePeriod,
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "No se pudo simular");
        }
        setImputeSummary(data);
        const notFoundItems = (data.notFoundItems ?? []) as NotFoundEntry[];
        const doubtful = (data.doubtful ?? []) as DoubtfulEntry[];
        const pendingCount =
          notFoundItems.filter((r) => !manualPlayerAssignments[r.paymentRowId]).length +
          doubtful.filter((d) => !manualPlayerAssignments[d.paymentRowId]).length;
        await persistSessionState(pendingCount, (data.already as number) ?? 0);
        toast({ title: "Resumen listo", description: data.message });
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Error al simular",
          description: err instanceof Error ? err.message : "No se pudo simular",
        });
      } finally {
        setSimulating(false);
      }
    },
    [user, schoolId, toast, imputePeriod, manualPlayerAssignments, persistSessionState]
  );

  const handleSimulate = useCallback(async () => {
    await runSimulate(buildImputeItems());
  }, [runSimulate, buildImputeItems]);

  useEffect(() => {
    if (Object.keys(initialManualPlayerAssignments).length === 0) return;
    void runSimulate(buildImputeItems());
    // Solo al reanudar sesión guardada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistPlayerAssignment = useCallback(
    async (
      row: PendingImputeRow,
      playerId: string,
      currentAssignments: Record<string, string>
    ): Promise<Record<string, string>> => {
      if (!user) throw new Error("Tenés que iniciar sesión");
      const item = imputeItemsById.get(row.paymentRowId);
      if (!item) throw new Error("No se encontró el pago");

      const token = await user.getIdToken();
      const aliasNames = buildPersistedAliasNames(item);
      const res = await fetch(
        `/api/reconciliacion-excel/save-player-alias?schoolId=${encodeURIComponent(schoolId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ playerId, aliasNames }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo guardar para la próxima conciliación");
      }

      return { ...currentAssignments, [row.paymentRowId]: playerId };
    },
    [user, imputeItemsById, schoolId]
  );

  const buildItemsWithOverrides = useCallback(
    (assignments: Record<string, string>): ImputePaymentItem[] =>
      buildImputeItems().map((i) => ({
        ...i,
        playerIdOverride: assignments[i.paymentRowId] ?? i.playerIdOverride,
      })),
    [buildImputeItems]
  );

  const handleAssignPlayer = useCallback(
    async (row: PendingImputeRow, playerIdOverride?: string) => {
      const playerId = playerIdOverride ?? playerPicks[row.paymentRowId];
      if (!playerId) {
        toast({ variant: "destructive", title: "Elegí un cliente de la náutica" });
        return;
      }

      setAssigningId(row.paymentRowId);
      try {
        const nextAssignments = await persistPlayerAssignment(
          row,
          playerId,
          manualPlayerAssignments
        );
        setManualPlayerAssignments(nextAssignments);
        setPlayerPicks((prev) => {
          const next = { ...prev };
          delete next[row.paymentRowId];
          return next;
        });

        const playerLabel =
          playerOptions.find((p) => p.id === playerId)?.displayName ?? playerId;
        toast({
          title: "Cliente asignado",
          description: `${row.targetName} → ${playerLabel}. Quedó guardado para el próximo mes.`,
        });

        await runSimulate(buildItemsWithOverrides(nextAssignments));
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Error al asignar",
          description: err instanceof Error ? err.message : "No se pudo asignar",
        });
      } finally {
        setAssigningId(null);
      }
    },
    [
      playerPicks,
      manualPlayerAssignments,
      persistPlayerAssignment,
      playerOptions,
      toast,
      runSimulate,
      buildItemsWithOverrides,
    ]
  );

  const handleAssignAllSuggested = useCallback(async () => {
    const toAssign = pendingImputeRows.filter((row) => {
      const playerId = playerPicks[row.paymentRowId] ?? row.suggestedPlayerId;
      return playerId && (row.score ?? 0) >= SUGGESTED_PLAYER_SCORE;
    });
    if (toAssign.length === 0) {
      toast({ variant: "destructive", title: "No hay sugerencias para confirmar" });
      return;
    }

    setAssigningId("__batch__");
    try {
      let nextAssignments = { ...manualPlayerAssignments };
      for (const row of toAssign) {
        const playerId = playerPicks[row.paymentRowId] ?? row.suggestedPlayerId!;
        nextAssignments = await persistPlayerAssignment(row, playerId, nextAssignments);
      }
      setManualPlayerAssignments(nextAssignments);
      setPlayerPicks((prev) => {
        const next = { ...prev };
        for (const row of toAssign) delete next[row.paymentRowId];
        return next;
      });
      toast({
        title: "Sugeridos confirmados",
        description: `${toAssign.length} clientes asignados`,
      });
      await runSimulate(buildItemsWithOverrides(nextAssignments));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error al confirmar",
        description: err instanceof Error ? err.message : "No se pudo confirmar",
      });
    } finally {
      setAssigningId(null);
    }
  }, [
    pendingImputeRows,
    playerPicks,
    manualPlayerAssignments,
    persistPlayerAssignment,
    toast,
    runSimulate,
    buildItemsWithOverrides,
  ]);

  const handleImpute = useCallback(async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Tenés que iniciar sesión" });
      return;
    }
    const items = buildImputeItems();
    if (items.length === 0) {
      toast({ variant: "destructive", title: "No hay pagos conciliados para imputar" });
      return;
    }
    setImputing(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/reconciliacion-excel/impute?schoolId=${encodeURIComponent(schoolId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            items,
            period: imputePeriod,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo imputar");
      }
      const applied = (data.applied as number) ?? 0;
      toast({
        title: applied > 0 ? `${applied} cobros acreditados` : "Nada nuevo para acreditar",
        description: data.message as string,
      });
      await runSimulate(buildImputeItems());
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error al imputar",
        description: err instanceof Error ? err.message : "No se pudo imputar",
      });
    } finally {
      setImputing(false);
      setConfirmImpute(false);
    }
  }, [user, buildImputeItems, schoolId, toast, imputePeriod, runSimulate]);

  const uniqueAccounts = useMemo(() => {
    const seen = new Set<string>();
    return relations.filter((r) => {
      if (seen.has(r.accountKey)) return false;
      seen.add(r.accountKey);
      return true;
    });
  }, [relations]);

  const reviewDone = imputeSummary?.simulate === true;
  const readyCount = imputeSummary?.applied ?? 0;
  const alreadyCount = imputeSummary?.already ?? 0;
  const readyToAcreditar = reviewDone && readyCount > 0;
  const allAcredited =
    reviewDone &&
    pendingImputeRows.length === 0 &&
    readyCount === 0 &&
    alreadyCount > 0;
  const workflowStep: 3 | 4 = readyToAcreditar || allAcredited ? 4 : 3;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Resultados de conciliación</CardTitle>
        <CardDescription>
          {allResolved.length} conciliados
          {manualResolvedCount > 0 ? ` (${manualResolvedCount} manual)` : ""}
          {pendingManualCount > 0 ? ` · ${pendingManualCount} sin conciliar` : ""}
          {allResolved.length > 0 ? ` · total pagado ${formatAmount(resolvedTotal)}` : ""}
          {pendingImputeRows.length > 0
            ? ` · ${pendingImputeRows.length} por asignar cliente`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {allResolved.length > 0 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3 rounded-lg border bg-muted/30 p-4">
              <WorkflowStep step={2} label="Conciliar Visa" status="done" />
              <WorkflowStep
                step={3}
                label="Revisar clientes"
                status={workflowStep === 3 ? "current" : "done"}
              />
              <WorkflowStep
                step={4}
                label="Acreditar cuota"
                status={
                  allAcredited ? "done" : workflowStep === 4 ? "current" : "upcoming"
                }
              />
            </div>

            {pendingManualCount > 0 ? (
              <Alert>
                <AlertDescription>
                  Hay <strong>{pendingManualCount} pagos sin conciliar</strong>. Terminá en la pestaña
                  «Sin conciliar» antes de acreditar la cuota.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <ClipboardList className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="font-medium">Paso 3 — Revisar qué se va a acreditar</p>
                      <p className="text-sm text-muted-foreground">
                        Cuota <strong>{formatPeriodLabel(imputePeriod)}</strong>. No guarda nada: solo
                        muestra cuántos cobros van a cada cliente y cuáles faltan asignar.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={reviewDone ? "outline" : "default"}
                    className="w-full sm:w-auto"
                    onClick={() => void handleSimulate()}
                    disabled={imputing || simulating || allAcredited}
                  >
                    {simulating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ClipboardList className="h-4 w-4 mr-2" />
                    )}
                    {reviewDone ? "Volver a revisar" : "Ver resumen de cobros"}
                  </Button>
                </div>

                <div
                  className={`rounded-lg border p-4 space-y-3 ${
                    readyToAcreditar
                      ? "border-primary/40 bg-primary/5"
                      : "border-dashed opacity-90"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        readyToAcreditar ? "bg-primary/10" : "bg-muted"
                      }`}
                    >
                      <UserCheck
                        className={`h-5 w-5 ${
                          readyToAcreditar ? "text-primary" : "text-muted-foreground"
                        }`}
                      />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="font-medium">Paso 4 — Acreditar en la cuota</p>
                      {allAcredited ? (
                        <p className="text-sm text-muted-foreground">
                          Todos los cobros conciliados ya están acreditados en{" "}
                          {formatPeriodLabel(imputePeriod)} ({alreadyCount} en total).
                        </p>
                      ) : !reviewDone ? (
                        <p className="text-sm text-muted-foreground">
                          Primero ejecutá el paso 3 para ver el resumen.
                        </p>
                      ) : readyCount > 0 && pendingImputeRows.length > 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Podés acreditar <strong>{readyCount} cobros</strong> ahora.
                          {alreadyCount > 0 ? (
                            <> Ya hay <strong>{alreadyCount}</strong> acreditados.</>
                          ) : null}{" "}
                          Quedan <strong>{pendingImputeRows.length}</strong> por asignar cliente
                          (podés volver después).
                        </p>
                      ) : pendingImputeRows.length > 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Asigná clientes en «Asignar cliente» para poder acreditar más cobros.
                          {alreadyCount > 0 ? (
                            <> Ya hay <strong>{alreadyCount}</strong> acreditados.</>
                          ) : null}
                        </p>
                      ) : readyCount > 0 ? (
                        <p className="text-sm text-muted-foreground">
                          <strong>{readyCount} cobros</strong>
                          {imputeSummary?.totalAmount
                            ? ` · ${formatAmount(imputeSummary.totalAmount)}`
                            : ""}{" "}
                          listos para acreditar en {formatPeriodLabel(imputePeriod)}.
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No hay cobros nuevos para acreditar en esta corrida.
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => setConfirmImpute(true)}
                    disabled={!readyToAcreditar || imputing || simulating || allAcredited}
                  >
                    {imputing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <UserCheck className="h-4 w-4 mr-2" />
                    )}
                    Acreditar {readyCount} cobros
                    {pendingImputeRows.length > 0
                      ? ` (quedan ${pendingImputeRows.length} pendientes)`
                      : " en la cuota"}
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : null}

        {imputeSummary ? (
          <Alert className={allAcredited ? "border-primary/30" : undefined}>
            <AlertDescription>
              {reviewDone && !allAcredited ? (
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Resumen — podés acreditar por partes; el progreso queda guardado
                </p>
              ) : null}
              {allAcredited ? (
                <p className="text-xs uppercase tracking-wide text-primary mb-1">
                  Cuota completa — todos los cobros acreditados
                </p>
              ) : null}
              <p className="font-medium">{imputeSummary.message}</p>
              {imputeSummary.totalAmount != null && imputeSummary.totalAmount > 0 ? (
                <p className="mt-1 text-sm">
                  Total a acreditar:{" "}
                  <strong>{formatAmount(imputeSummary.totalAmount)}</strong>
                </p>
              ) : null}
              {imputeSummary.wouldApply && imputeSummary.wouldApply.length > 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Ej.:{" "}
                  {imputeSummary.wouldApply
                    .slice(0, 5)
                    .map((w) => `${w.playerName} (${formatAmount(w.amount)})`)
                    .join(" · ")}
                  {imputeSummary.applied > 5
                    ? ` · y ${imputeSummary.applied - 5} más`
                    : ""}
                </p>
              ) : null}
              {pendingImputeRows.length > 0 ? (
                <p className="mt-2 text-sm">
                  <strong>{pendingImputeRows.length} por asignar:</strong> elegí o confirmá el cliente en
                  «Asignar cliente».
                </p>
              ) : null}
              {imputeSummary.skippedCount > 0 ? (
                <p className="mt-2 text-sm">
                  <strong>{imputeSummary.skippedCount} omitidos:</strong> ya tenían la cuota pagada, el banco marcó &quot;no aplicada&quot;, u otro motivo.
                  {imputeSummary.skipped.length > 0 ? (
                    <> Ej.: {imputeSummary.skipped.slice(0, 5).join(" · ")}</>
                  ) : null}
                </p>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <Tabs
          defaultValue={
            pendingImputeRows.length > 0
              ? "assign"
              : pendingManualCount > 0
                ? "unmatched"
                : "matched"
          }
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="matched" className="gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Conciliados ({allResolved.length})
            </TabsTrigger>
            <TabsTrigger value="assign" className="gap-1">
              <UserPlus className="h-4 w-4" />
              Asignar cliente ({pendingImputeRows.length})
            </TabsTrigger>
            <TabsTrigger value="unmatched" className="gap-1">
              <XCircle className="h-4 w-4" />
              Sin conciliar ({pendingManualCount})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="assign" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Pagos sin match exacto en NauticAdmin. Si hay sugerencia alta (≥92%), ya viene pre-cargada.
              Cada asignación se guarda en la náutica para que el mes que viene matchee solo.
            </p>
            {!imputeSummary ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Ejecutá el paso 3 «Ver resumen de cobros» para ver los pagos pendientes.
              </p>
            ) : pendingImputeRows.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">
                Todos los pagos tienen cliente asignado o matchearon automáticamente.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  {pendingImputeRows.some(
                    (r) => r.suggestedPlayerId && (r.score ?? 0) >= SUGGESTED_PLAYER_SCORE
                  ) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={simulating || assigningId !== null}
                      onClick={() => void handleAssignAllSuggested()}
                    >
                      Confirmar sugeridos (
                      {
                        pendingImputeRows.filter(
                          (r) =>
                            (playerPicks[r.paymentRowId] ?? r.suggestedPlayerId) &&
                            (r.score ?? 0) >= SUGGESTED_PLAYER_SCORE
                        ).length
                      }
                      )
                    </Button>
                  ) : null}
                </div>
                <div className="rounded border overflow-x-auto max-h-[28rem]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente listado (col G)</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                        <TableHead className="min-w-[280px]">Cliente NauticAdmin</TableHead>
                        <TableHead className="w-28" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingImputeRows.map((row) => {
                        const selectedPlayerId =
                          playerPicks[row.paymentRowId] ??
                          (row.score !== undefined && row.score >= SUGGESTED_PLAYER_SCORE
                            ? row.suggestedPlayerId
                            : undefined) ??
                          "";
                        const hasSuggestion = Boolean(row.suggestedPlayerId);

                        return (
                          <TableRow key={row.paymentRowId}>
                            <TableCell>
                              <div className="space-y-0.5">
                                <p className="font-medium">{row.targetName}</p>
                                {row.payerRaw !== row.targetName ? (
                                  <p className="text-xs text-muted-foreground">
                                    Pagador Visa: {row.payerRaw}
                                  </p>
                                ) : null}
                                {row.accountRaw && row.accountRaw !== row.targetName ? (
                                  <p className="text-xs text-muted-foreground">{row.accountRaw}</p>
                                ) : null}
                                {hasSuggestion ? (
                                  <Badge
                                    variant={
                                      (row.score ?? 0) >= SUGGESTED_PLAYER_SCORE
                                        ? "default"
                                        : "secondary"
                                    }
                                    className="text-xs mt-1"
                                  >
                                    Sugerido {Math.round((row.score ?? 0) * 100)}%
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs mt-1">
                                    Sin match
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {formatAmount(row.amount)}
                            </TableCell>
                            <TableCell>
                              <ClientSelectCombobox
                                value={selectedPlayerId}
                                onChange={(id) =>
                                  setPlayerPicks((prev) => ({ ...prev, [row.paymentRowId]: id }))
                                }
                                players={playerOptions}
                                placeholder={
                                  hasSuggestion
                                    ? row.suggestedPlayerName ?? "Buscar cliente…"
                                    : "Buscar cliente…"
                                }
                                searchPlaceholder="Apellido o nombre…"
                                fullWidth
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                size="sm"
                                disabled={
                                  !selectedPlayerId ||
                                  assigningId === row.paymentRowId ||
                                  simulating
                                }
                                onClick={() => void handleAssignPlayer(row, selectedPlayerId)}
                              >
                                {assigningId === row.paymentRowId ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <UserPlus className="h-4 w-4 mr-1" />
                                )}
                                Asignar
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>
          <TabsContent value="matched" className="mt-4">
            <div className="rounded border overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pagador (rendición)</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead>Cliente listado (col G)</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allResolved.map((r) => (
                    <TableRow key={r.paymentRowId}>
                      <TableCell>{r.payerRaw}</TableCell>
                      <TableCell>
                        {r.sourceKind ? (
                          <Badge variant="secondary">{PAYMENT_FILE_KIND_LABEL[r.sourceKind]}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatAmount(r.amount ?? 0)}
                      </TableCell>
                      <TableCell>{getAccountRaw(r.effectiveAccountKey)}</TableCell>
                      <TableCell>
                        {r.isManual ? (
                          <Badge variant="outline">Manual</Badge>
                        ) : (
                          r.matchType
                        )}
                      </TableCell>
                      <TableCell>
                        {r.isManual ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleUndoManual(r.paymentRowId)}
                                >
                                  <Undo2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Deshacer conciliación manual</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="unmatched" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Pagador = nombre en la rendición Visa. Cliente = columna G del listado (quien recibe cuota y
              factura). Asigná una vez; el pago pasa a conciliados y entra en simular/imputar.
            </p>
            {uniqueAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Cargá el listado interno (paso 1) para ver los clientes disponibles.
              </p>
            ) : pendingManualCount === 0 ? (
              <p className="text-muted-foreground py-8 text-center">
                No hay pagos sin conciliar.
              </p>
            ) : (
              <div className="rounded border overflow-x-auto max-h-[28rem]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pagador (rendición)</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                      <TableHead>Cliente listado (col G)</TableHead>
                      <TableHead className="w-32" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...openReview, ...openUnmatched].map((r) => {
                      const suggestedKey =
                        r.status === "REVIEW" && r.candidateAccounts[0]?.accountKey
                          ? r.candidateAccounts[0].accountKey
                          : "";
                      const selectedKey =
                        manualSelections[r.paymentRowId] ?? suggestedKey;
                      const accountOptions =
                        r.status === "REVIEW" && r.candidateAccounts.length > 0
                          ? [
                              ...r.candidateAccounts.map((c) => ({
                                accountKey: c.accountKey,
                                accountRaw: c.accountRaw,
                                hint: `${c.score}`,
                              })),
                              ...uniqueAccounts
                                .filter(
                                  (rel) =>
                                    !r.candidateAccounts.some(
                                      (c) => c.accountKey === rel.accountKey
                                    )
                                )
                                .map((rel) => ({
                                  accountKey: rel.accountKey,
                                  accountRaw: rel.accountRaw,
                                  hint: null as string | null,
                                })),
                            ]
                          : uniqueAccounts.map((rel) => ({
                              accountKey: rel.accountKey,
                              accountRaw: rel.accountRaw,
                              hint: null as string | null,
                            }));

                      return (
                        <TableRow key={r.paymentRowId}>
                          <TableCell>
                            <div className="space-y-1">
                              <p>{r.payerRaw}</p>
                              {r.sourceKind ? (
                                <Badge variant="secondary" className="text-xs">
                                  {PAYMENT_FILE_KIND_LABEL[r.sourceKind]}
                                </Badge>
                              ) : null}
                              {r.status === "REVIEW" && r.candidateAccounts.length > 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  Sugerido: {r.candidateAccounts[0].accountRaw}
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatAmount(r.amount ?? 0)}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={selectedKey}
                              onValueChange={(v) => handleManualSelect(r.paymentRowId, v)}
                            >
                              <SelectTrigger className="w-full min-w-[220px] max-w-md">
                                <SelectValue placeholder="Elegir cliente del listado…" />
                              </SelectTrigger>
                              <SelectContent>
                                {accountOptions.map((opt) => (
                                  <SelectItem key={opt.accountKey} value={opt.accountKey}>
                                    {opt.accountRaw}
                                    {opt.hint ? ` (${opt.hint})` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              disabled={!selectedKey}
                              onClick={() => handleManualResolve(r, selectedKey)}
                            >
                              <Link2 className="h-4 w-4 mr-1" />
                              Conciliar
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>

    <AlertDialog open={confirmImpute} onOpenChange={setConfirmImpute}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Acreditar cobros en la cuota?</AlertDialogTitle>
          <AlertDialogDescription>
            Se van a registrar <strong>{readyCount} cobros</strong>
            {imputeSummary?.totalAmount
              ? ` por ${formatAmount(imputeSummary.totalAmount)}`
              : ""}{" "}
            en la cuota de <strong>{formatPeriodLabel(imputePeriod)}</strong>.
            {pendingImputeRows.length > 0 ? (
              <>
                {" "}
                Los <strong>{pendingImputeRows.length}</strong> sin asignar quedan pendientes para
                cuando vuelvas.
              </>
            ) : null}{" "}
            Si un cliente ya tenía esa cuota paga, no se duplica.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={imputing}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={imputing}
            onClick={(e) => {
              e.preventDefault();
              void handleImpute();
            }}
          >
            {imputing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Sí, acreditar cobros
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
