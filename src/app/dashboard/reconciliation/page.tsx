"use client";

import { useState, useCallback, useEffect } from "react";
import { useUserProfile, useUser } from "@/firebase";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Loader2, GitMerge, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function ReconciliationPage() {
  const { profile, isReady, activeSchoolId } = useUserProfile();
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [relations, setRelations] = useState<RelationRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [results, setResults] = useState<ReconciliationResult[] | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

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
      toast({
        title: "Conciliación completada",
        description: `${res.filter((r) => r.status === "MATCHED").length} conciliados, ${res.filter((r) => r.status === "REVIEW").length} a revisar, ${res.filter((r) => r.status === "UNMATCHED").length} sin conciliar`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "Error al conciliar",
      });
    } finally {
      setReconciling(false);
    }
  }, [relations, payments, user, schoolId, toast]);

  const handleSaveRule = useCallback(
    async (payerRaw: string, accountKey: string, accountRaw: string) => {
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/reconciliacion-excel/save-rule?schoolId=${encodeURIComponent(schoolId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ payerRaw, accountKey, accountRaw }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al guardar");
      }
      setRelations((prev) => [
        ...prev.filter(
          (r) => !(r.payerKey === normalizePayer(payerRaw) && r.accountKey === accountKey)
        ),
        {
          accountKey,
          payerKey: normalizePayer(payerRaw),
          payerRaw,
          accountRaw,
          createdAt: new Date().toISOString(),
        },
      ]);
      toast({ title: "Regla guardada" });
    },
    [user, schoolId, toast]
  );

  const handleReset = useCallback(async () => {
    if (!user) return;
    setResetting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/reconciliacion-excel/reset?schoolId=${encodeURIComponent(schoolId)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo reiniciar");
      setRelations([]);
      setPayments([]);
      setResults(null);
      setSessionKey((k) => k + 1);
      toast({ title: "Listo para empezar de nuevo", description: data.message });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo reiniciar",
      });
    } finally {
      setResetting(false);
    }
  }, [user, schoolId, toast]);

  useEffect(() => {
    if (isReady && !canAccess) router.replace("/dashboard");
  }, [isReady, canAccess, router]);

  if (!isReady) return null;
  if (!canAccess) return null;

  return (
    <div className="flex flex-col gap-6 min-w-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-headline sm:text-3xl">
          Conciliación de Pagos
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Paso 1: listados internos de crédito y débito (a quién imputar). Paso 2: rendiciones Visa de crédito y débito.
        </p>
      </div>

      <ImportRelations key={`relations-${sessionKey}`} onRelationsLoaded={handleRelationsLoaded} />

      <ImportPayments
        key={`payments-${sessionKey}`}
        schoolId={schoolId}
        onPaymentsLoaded={handlePaymentsLoaded}
      />

      <div className="flex flex-wrap items-center gap-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleConciliar}
                disabled={
                  reconciling ||
                  resetting ||
                  relations.length === 0 ||
                  payments.length === 0
                }
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

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={resetting || reconciling}>
              {resetting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Empezar de nuevo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Empezar de nuevo?</AlertDialogTitle>
              <AlertDialogDescription>
                Borra los pagos que se hayan imputado desde esta conciliación Visa y limpia
                la pantalla para cargar los Excel otra vez. Los clientes y otros pagos del
                sistema no se tocan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleReset();
                }}
              >
                Borrar y reiniciar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {results && results.length > 0 && (
        <ReconciliationResults
          schoolId={schoolId}
          results={results}
          relations={relations}
          onSaveRule={handleSaveRule}
        />
      )}
    </div>
  );
}
