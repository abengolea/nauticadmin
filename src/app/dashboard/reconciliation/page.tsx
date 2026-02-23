"use client";

import { useState, useCallback, useEffect } from "react";
import { useUserProfile, useUser } from "@/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, CheckCircle2, Banknote, Loader2, GitMerge } from "lucide-react";
import { ReconciliationImport } from "@/components/reconciliation/ReconciliationImport";
import { ReconciliationReview } from "@/components/reconciliation/ReconciliationReview";
import { ImportAliasesFromExcel } from "@/components/payments/ImportAliasesFromExcel";
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
  ColumnMapping,
} from "@/lib/reconciliacion-excel/types";
import { Button } from "@/components/ui/button";

export default function ReconciliationPage() {
  const { profile, isReady, activeSchoolId } = useUserProfile();
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [tab, setTab] = useState<"excel" | "banco">("excel");
  const [relations, setRelations] = useState<RelationRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [results, setResults] = useState<ReconciliationResult[] | null>(null);
  const [reconciling, setReconciling] = useState(false);

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

  const handleMappingReady = useCallback((_m: ColumnMapping) => {}, []);

  const handleConciliar = useCallback(async () => {
    if (relations.length === 0) {
      toast({ variant: "destructive", title: "Cargá primero el archivo de relaciones" });
      return;
    }
    if (payments.length === 0) {
      toast({ variant: "destructive", title: "Cargá primero el archivo de pagos" });
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

  const loadStoredRelations = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(
      `/api/reconciliacion-excel/relations?schoolId=${encodeURIComponent(schoolId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data = await res.json();
      setRelations(data.relations ?? []);
    }
  }, [user, schoolId]);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "banco") setTab("banco");
    else if (t === "excel") setTab("excel");
  }, [searchParams]);

  useEffect(() => {
    if (canAccess && tab === "excel") loadStoredRelations();
  }, [loadStoredRelations, canAccess, tab]);

  useEffect(() => {
    if (isReady && !canAccess) router.replace("/dashboard");
  }, [isReady, canAccess, router]);

  if (!isReady) return null;
  if (!canAccess) return null;

  const batchId = searchParams.get("batch");

  return (
    <div className="flex flex-col gap-6 min-w-0">
      <h1 className="text-2xl font-bold tracking-tight font-headline sm:text-3xl">
        Conciliación de Pagos
      </h1>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          const t = v as "excel" | "banco";
          setTab(t);
          router.replace(`/dashboard/reconciliation?tab=${t}`, { scroll: false });
        }}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="excel" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Excel / CSV
          </TabsTrigger>
          <TabsTrigger value="banco" className="gap-2">
            <Banknote className="h-4 w-4" />
            Formato banco
          </TabsTrigger>
        </TabsList>

        <TabsContent value="excel" className="space-y-6 mt-6">
          <p className="text-sm text-muted-foreground">
            Cargá relaciones (Cuenta ↔ Pagador) y pagos desde Excel o CSV. Mapeá las columnas y conciliá.
          </p>

          <ImportRelations
            schoolId={schoolId}
            onRelationsLoaded={handleRelationsLoaded}
            initialRelations={relations}
          />

          <ImportPayments
            onPaymentsLoaded={handlePaymentsLoaded}
            onMappingReady={handleMappingReady}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleConciliar}
              disabled={
                reconciling ||
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
            <Button variant="outline" size="sm" onClick={loadStoredRelations}>
              Cargar relaciones guardadas
            </Button>
          </div>

          {results && results.length > 0 && (
            <ReconciliationResults
              results={results}
              relations={relations}
              onSaveRule={handleSaveRule}
            />
          )}
        </TabsContent>

        <TabsContent value="banco" className="space-y-8 mt-6">
          <p className="text-sm text-muted-foreground">
            Importá archivos en formato banco (Clientes + Pagos) y revisá la conciliación automática.
          </p>

          <ReconciliationImport schoolId={schoolId} />

          <div className="border-t pt-6">
            <ImportAliasesFromExcel schoolId={schoolId} />
          </div>

          <ReconciliationReview schoolId={schoolId} initialBatchId={batchId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
