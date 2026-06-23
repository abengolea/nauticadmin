"use client";

import { useState, useCallback, useEffect } from "react";
import { useUserProfile, useUser } from "@/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, Banknote, Loader2, GitMerge, Info, ChevronDown, ChevronUp } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const [infoOpen, setInfoOpen] = useState(false);

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
      `/api/reconciliation/payer-mappings?schoolId=${encodeURIComponent(schoolId)}&targetType=account`,
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

      <Collapsible open={infoOpen} onOpenChange={setInfoOpen}>
        <Alert className="border-muted bg-muted/30">
          <Info className="h-4 w-4" />
          <div className="flex-1 space-y-1">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left font-medium hover:underline focus:outline-none focus:underline"
              >
                <span>¿Por qué hay dos opciones? (Excel/CSV vs Formato banco)</span>
                {infoOpen ? (
                  <ChevronUp className="h-4 w-4 shrink-0 opacity-70" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <AlertDescription asChild>
                <div className="mt-3 space-y-4 text-sm text-muted-foreground">
                  <div>
                    <p className="font-medium text-foreground">Excel / CSV</p>
                    <p>
                      Para archivos genéricos de cualquier origen: home banking, planillas propias, exportaciones de tarjetas, etc.
                      Subís dos archivos: uno con relaciones (Cuenta ↔ Pagador) y otro con los pagos. Mapeás las columnas manualmente
                      y el sistema concilia con matching exacto y fuzzy. Los resultados se guardan en auditoría. Ideal cuando cada
                      banco o proveedor exporta en formato distinto.
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Formato banco</p>
                    <p>
                      Para archivos en el formato estándar del banco: dos Excel (Clientes + Pagos) con estructura predefinida.
                      El sistema importa, hace matching automático y te pide confirmar o asignar manualmente los casos dudosos.
                      Los datos se persisten en Firestore. Ideal cuando ya tenés plantillas o exports recurrentes en ese formato.
                    </p>
                  </div>
                  <p className="text-xs border-t pt-3">
                    <strong>Auditoría:</strong> En Excel/CSV cada conciliación se registra en recExcelAudit. En Formato banco,
                    los matches y alias se guardan en recMatches y recPayerAliases para trazabilidad.
                  </p>
                </div>
              </AlertDescription>
            </CollapsibleContent>
          </div>
        </Alert>
      </Collapsible>

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

          <p className="text-sm text-muted-foreground">
            Con relaciones y pagos cargados, ejecutá la conciliación. Si ya tenés relaciones guardadas, podés cargarlas sin subir el archivo de nuevo.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent>
                  <p>Ejecuta el matching entre pagos y relaciones.</p>
                  <p className="text-xs mt-1">Usa coincidencia exacta y fuzzy (Jaro-Winkler).</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={loadStoredRelations}>
                    Cargar relaciones guardadas
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Trae las relaciones que guardaste antes.</p>
                  <p className="text-xs mt-1">Útil si no subís el archivo de relaciones en esta sesión.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
