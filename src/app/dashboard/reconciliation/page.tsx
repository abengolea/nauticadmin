"use client";

import { useState, useCallback, useEffect } from "react";
import { useUserProfile, useUser } from "@/firebase";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Loader2, GitMerge } from "lucide-react";
import { ImportRelations } from "@/components/reconciliacion/ImportRelations";
import { ImportPayments } from "@/components/reconciliacion/ImportPayments";
import { ReconciliationResults } from "@/components/reconciliacion/ReconciliationResults";
import {
  runReconciliation,
  buildAuditEntries,
} from "@/lib/reconciliacion-excel/reconcile";
import { normalizePayer } from "@/lib/reconciliacion-excel/normalize";
import type {
  RelationRow,
  PaymentRow,
  ReconciliationResult,
} from "@/lib/reconciliacion-excel/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { RecExcelSession } from "@/lib/reconciliacion-excel/session-types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function defaultImputePeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function ReconciliationPage() {
  const { profile, isReady, activeSchoolId } = useUserProfile();
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [relations, setRelations] = useState<RelationRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [results, setResults] = useState<ReconciliationResult[] | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [imputePeriod, setImputePeriod] = useState(defaultImputePeriod);
  const [pendingSessions, setPendingSessions] = useState<RecExcelSession[]>([]);
  const [resumeKey, setResumeKey] = useState(0);
  const [sessionManualResolved, setSessionManualResolved] = useState<
    Record<string, string>
  >({});
  const [sessionManualPlayers, setSessionManualPlayers] = useState<
    Record<string, string>
  >({});

  const schoolId = activeSchoolId ?? "";
  const canAccess = profile?.role === "school_admin" && !!schoolId;

  const handleRelationsLoaded = useCallback((r: RelationRow[]) => {
    setRelations(r);
    setResults(null);
  }, []);

  const handlePaymentsLoaded = useCallback((p: PaymentRow[]) => {
    setPayments(p);
    setResults(null);
  }, []);

  const refreshPendingSessions = useCallback(async () => {
    if (!user || !schoolId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/reconciliacion-excel/session?schoolId=${encodeURIComponent(schoolId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data.sessions)) {
        setPendingSessions(data.sessions as RecExcelSession[]);
      }
    } catch {
      /* ignore */
    }
  }, [user, schoolId]);

  const saveSession = useCallback(
    async (payload: {
      manualResolved: Record<string, string>;
      manualPlayerAssignments: Record<string, string>;
      imputedCount: number;
      pendingAssignCount: number;
      totalConciliated: number;
    }) => {
      if (!user || !schoolId || !results) return;
      const token = await user.getIdToken();
      const creditCount = payments.filter((p) => p.kind === "credit").length;
      const debitCount = payments.filter((p) => p.kind === "debit").length;
      await fetch(
        `/api/reconciliacion-excel/session?schoolId=${encodeURIComponent(schoolId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session: {
              period: imputePeriod,
              status: "in_progress",
              relations,
              payments,
              results,
              manualResolved: payload.manualResolved,
              manualPlayerAssignments: payload.manualPlayerAssignments,
              totalConciliated: payload.totalConciliated,
              imputedCount: payload.imputedCount,
              pendingAssignCount: payload.pendingAssignCount,
              creditCount,
              debitCount,
            } satisfies Omit<RecExcelSession, "updatedAt" | "updatedBy">,
          }),
        }
      );
      await refreshPendingSessions();
    },
    [user, schoolId, results, relations, payments, imputePeriod, refreshPendingSessions]
  );

  const handleContinueSession = useCallback((session: RecExcelSession) => {
    setImputePeriod(session.period);
    setRelations(session.relations);
    setPayments(session.payments);
    setResults(session.results);
    setSessionManualResolved(session.manualResolved ?? {});
    setSessionManualPlayers(session.manualPlayerAssignments ?? {});
    setResumeKey((k) => k + 1);
    toast({
      title: "Sesión reanudada",
      description: `Cuota ${session.period}: ${session.pendingAssignCount} pagos por asignar, ${session.imputedCount} ya acreditados.`,
    });
  }, [toast]);

  const handleConciliar = useCallback(async () => {
    const creditPayments = payments.filter((p) => p.kind === "credit");
    const debitPayments = payments.filter((p) => p.kind === "debit");
    const creditRelations = relations.filter((r) => r.kind === "credit");
    const debitRelations = relations.filter((r) => r.kind === "debit");

    if (payments.length === 0) {
      toast({ variant: "destructive", title: "Cargá primero la rendición de crédito o débito" });
      return;
    }
    if (creditPayments.length > 0 && creditRelations.length === 0) {
      toast({
        variant: "destructive",
        title: "Falta el listado de crédito",
        description: "Subí el Excel 9 VISA CREDITO… en el paso 1.",
      });
      return;
    }
    if (debitPayments.length > 0 && debitRelations.length === 0) {
      toast({
        variant: "destructive",
        title: "Falta el listado de débito",
        description: "Subí el Excel 9 VISA DEBITO… en el paso 1.",
      });
      return;
    }
    if (relations.length === 0) {
      toast({ variant: "destructive", title: "Cargá el listado de a quién imputar" });
      return;
    }
    setReconciling(true);
    try {
      const res = runReconciliation(relations, payments);
      setResults(res);
      if (user) {
        const token = await user.getIdToken();
        const auditEntries = buildAuditEntries(res, normalizePayer);
        await fetch(
          `/api/reconciliacion-excel/audit?schoolId=${encodeURIComponent(schoolId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ entries: auditEntries }),
          }
        );
      }
      const matched = res.filter((r) => r.status === "MATCHED").length;
      toast({
        title: "Conciliación completada",
        description: `${matched} conciliados, ${res.filter((r) => r.status === "REVIEW").length} a revisar, ${res.filter((r) => r.status === "UNMATCHED").length} sin conciliar`,
      });
      setSessionManualResolved({});
      setSessionManualPlayers({});
      setResumeKey((k) => k + 1);
      if (user) {
        const token = await user.getIdToken();
        const creditCount = payments.filter((p) => p.kind === "credit").length;
        const debitCount = payments.filter((p) => p.kind === "debit").length;
        await fetch(
          `/api/reconciliacion-excel/session?schoolId=${encodeURIComponent(schoolId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              session: {
                period: imputePeriod,
                status: "in_progress",
                relations,
                payments,
                results: res,
                manualResolved: {},
                manualPlayerAssignments: {},
                totalConciliated: matched,
                imputedCount: 0,
                pendingAssignCount: matched,
                creditCount,
                debitCount,
              },
            }),
          }
        );
        await refreshPendingSessions();
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "Error al conciliar",
      });
    } finally {
      setReconciling(false);
    }
  }, [relations, payments, user, schoolId, toast, imputePeriod, refreshPendingSessions]);

  useEffect(() => {
    if (isReady && !canAccess) router.replace("/dashboard");
  }, [isReady, canAccess, router]);

  useEffect(() => {
    if (canAccess && user) void refreshPendingSessions();
  }, [canAccess, user, refreshPendingSessions]);

  if (!isReady) return null;
  if (!canAccess) return null;

  return (
    <div className="flex flex-col gap-6 min-w-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-headline sm:text-3xl">
          Conciliación de Pagos
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          <strong>1.</strong> Cargá listados internos y rendiciones Visa ·{" "}
          <strong>2.</strong> Conciliar · <strong>3.</strong> Revisar clientes ·{" "}
          <strong>4.</strong> Acreditar la cuota. El cliente (col G) recibe la cuota y la factura.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="reconciliation-period">Cuota que estamos cargando</Label>
          <Input
            id="reconciliation-period"
            type="month"
            className="w-[200px]"
            value={imputePeriod}
            onChange={(e) => setImputePeriod(e.target.value)}
          />
          <p className="text-xs text-muted-foreground max-w-md">
            Mes de la cuota (ej. rendición sept → 2026-10). Cliente col G = imputar y facturar.
          </p>
        </div>
      </div>

      {pendingSessions.filter(
        (s) => !(results && results.length > 0 && s.period === imputePeriod)
      ).length > 0 ? (
        <div className="space-y-3">
          {pendingSessions
            .filter((s) => !(results && results.length > 0 && s.period === imputePeriod))
            .map((session) => (
            <Alert key={session.period} className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <strong>Cuota {session.period}</strong> — pendiente de terminar:{" "}
                  <strong>{session.pendingAssignCount}</strong> pagos por asignar cliente
                  {session.imputedCount > 0 ? (
                    <> · <strong>{session.imputedCount}</strong> ya acreditados</>
                  ) : null}
                  {session.creditCount > 0 || session.debitCount > 0 ? (
                    <span className="text-muted-foreground">
                      {" "}
                      ({session.creditCount} crédito
                      {session.debitCount > 0 ? `, ${session.debitCount} débito` : ""})
                    </span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleContinueSession(session)}
                >
                  Continuar
                </Button>
              </AlertDescription>
            </Alert>
            ))}
        </div>
      ) : null}

      <ImportRelations onRelationsLoaded={handleRelationsLoaded} />

      <ImportPayments schoolId={schoolId} onPaymentsLoaded={handlePaymentsLoaded} />

      <div className="flex flex-wrap items-center gap-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleConciliar}
                disabled={reconciling || relations.length === 0 || payments.length === 0}
              >
                {reconciling ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <GitMerge className="h-4 w-4 mr-2" />
                )}
                Conciliar
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Cruza el listado con los pagos de Visa.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {results && results.length > 0 && (
        <ReconciliationResults
          key={resumeKey}
          schoolId={schoolId}
          results={results}
          relations={relations}
          imputePeriod={imputePeriod}
          initialManualResolved={sessionManualResolved}
          initialManualPlayerAssignments={sessionManualPlayers}
          onSaveSession={saveSession}
        />
      )}
    </div>
  );
}
