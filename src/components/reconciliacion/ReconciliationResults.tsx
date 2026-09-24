"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useUser } from "@/firebase";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertCircle, XCircle, Loader2, Save, UserCheck } from "lucide-react";
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

type ImputeSummary = {
  applied: number;
  already: number;
  alreadyPaidPeriod?: number;
  period?: string;
  notFoundCount: number;
  notFound: string[];
  skippedCount: number;
  skipped: string[];
  message: string;
};

type ReconciliationResultsProps = {
  schoolId: string;
  results: ReconciliationResult[];
  relations: RelationRow[];
  onSaveRule: (payerRaw: string, accountKey: string, accountRaw: string) => Promise<void>;
};

export function ReconciliationResults({
  schoolId,
  results,
  relations,
  onSaveRule,
}: ReconciliationResultsProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [manualSelections, setManualSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmImpute, setConfirmImpute] = useState(false);
  const [imputing, setImputing] = useState(false);
  const [imputeSummary, setImputeSummary] = useState<ImputeSummary | null>(null);
  const [imputePeriod, setImputePeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const matched = results.filter((r) => r.status === "MATCHED");
  const review = results.filter((r) => r.status === "REVIEW");
  const unmatched = results.filter((r) => r.status === "UNMATCHED");

  const handleManualSelect = useCallback((rowId: string, accountKey: string) => {
    setManualSelections((prev) => ({ ...prev, [rowId]: accountKey }));
  }, []);

  const handleSaveRule = useCallback(
    async (r: ReconciliationResult) => {
      const accountKey = manualSelections[r.paymentRowId];
      if (!accountKey) {
        toast({ variant: "destructive", title: "Seleccioná una cuenta" });
        return;
      }
      const cand = r.candidateAccounts.find((c) => c.accountKey === accountKey);
      const accountRaw = cand?.accountRaw ?? relations.find((rel) => rel.accountKey === accountKey)?.accountRaw ?? accountKey;
      setSaving(r.paymentRowId);
      try {
        await onSaveRule(r.payerRaw, accountKey, accountRaw);
        toast({ title: "Regla guardada" });
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Error",
          description: err instanceof Error ? err.message : "No se pudo guardar",
        });
      } finally {
        setSaving(null);
      }
    },
    [manualSelections, onSaveRule, toast, relations]
  );

  const getAccountRaw = (accountKey: string) =>
    relations.find((r) => r.accountKey === accountKey)?.accountRaw ?? accountKey;

  const formatAmount = (n: number) =>
    `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const matchedTotal = matched.reduce((s, r) => s + (r.amount ?? 0), 0);

  /** Cuentas únicas para asignación manual en Sin Conciliar */
  const handleImpute = useCallback(async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Tenés que iniciar sesión" });
      return;
    }
    const items: ImputePaymentItem[] = matched
      .filter((r) => r.matchedAccountKey && (r.amount ?? 0) > 0)
      .map((r) => ({
        paymentRowId: r.paymentRowId,
        payerRaw: r.payerRaw,
        amount: r.amount ?? 0,
        accountKey: r.matchedAccountKey!,
        accountRaw: getAccountRaw(r.matchedAccountKey!),
        sourceKind: r.sourceKind,
        aplicada: r.aplicada,
        cardLast4: r.cardLast4,
      }));
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
          body: JSON.stringify({ items, period: imputePeriod }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo imputar");
      }
      setImputeSummary(data);
      toast({ title: "Pagos imputados", description: data.message });
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
  }, [user, matched, schoolId, toast, relations, imputePeriod]);

  const uniqueAccounts = useMemo(() => {
    const seen = new Set<string>();
    return relations.filter((r) => {
      if (seen.has(r.accountKey)) return false;
      seen.add(r.accountKey);
      return true;
    });
  }, [relations]);

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Resultados de conciliación</CardTitle>
        <CardDescription>
          {matched.length} conciliados · {review.length} a revisar · {unmatched.length} sin conciliar
          {matched.length > 0 ? ` · total pagado ${formatAmount(matchedTotal)}` : ""}
        </CardDescription>
        {matched.length > 0 ? (
          <div className="pt-2 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="impute-period">Cuota a imputar</Label>
              <Input
                id="impute-period"
                type="month"
                className="w-[180px]"
                value={imputePeriod}
                onChange={(e) => setImputePeriod(e.target.value)}
              />
            </div>
            <Button onClick={() => setConfirmImpute(true)} disabled={imputing}>
              {imputing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserCheck className="h-4 w-4 mr-2" />
              )}
              Imputar {matched.length} pagos a clientes
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {imputeSummary ? (
          <Alert className="mb-4">
            <AlertDescription>
              <p className="font-medium">{imputeSummary.message}</p>
              {imputeSummary.notFoundCount > 0 ? (
                <p className="mt-2 text-sm">
                  <strong>{imputeSummary.notFoundCount} sin cliente:</strong> no están cargados en la náutica con ese DNI o nombre.
                  Revisá que tengan el DNI en la ficha del cliente.
                  {imputeSummary.notFound.length > 0 ? (
                    <> Ej.: {imputeSummary.notFound.slice(0, 6).join(" · ")}
                      {imputeSummary.notFoundCount > 6
                        ? ` y ${imputeSummary.notFoundCount - 6} más`
                        : ""}
                    </>
                  ) : null}
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
        <Tabs defaultValue="matched" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="matched" className="gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Conciliados ({matched.length})
            </TabsTrigger>
            <TabsTrigger value="review" className="gap-1">
              <AlertCircle className="h-4 w-4" />
              A Revisar ({review.length})
            </TabsTrigger>
            <TabsTrigger value="unmatched" className="gap-1">
              <XCircle className="h-4 w-4" />
              Sin Conciliar ({unmatched.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="matched" className="mt-4">
            <div className="rounded border overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pagador</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead>Imputar a</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matched.map((r) => (
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
                      <TableCell>
                        {r.matchedAccountKey
                          ? getAccountRaw(r.matchedAccountKey)
                          : "—"}
                      </TableCell>
                      <TableCell>{r.matchType}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="review" className="mt-4">
            <div className="space-y-4">
              {review.map((r) => (
                <div
                  key={r.paymentRowId}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <p className="font-medium flex flex-wrap items-center gap-2">
                    {r.payerRaw}
                    <span className="tabular-nums">{formatAmount(r.amount ?? 0)}</span>
                    {r.sourceKind ? (
                      <Badge variant="secondary">{PAYMENT_FILE_KIND_LABEL[r.sourceKind]}</Badge>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Candidatos (score): {r.candidateAccounts.map((c) => `${c.accountRaw} (${c.score})`).join(", ")}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={manualSelections[r.paymentRowId] ?? ""}
                      onValueChange={(v) => handleManualSelect(r.paymentRowId, v)}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Elegir cuenta…" />
                      </SelectTrigger>
                      <SelectContent>
                        {r.candidateAccounts.map((c) => (
                          <SelectItem key={c.accountKey} value={c.accountKey}>
                            {c.accountRaw} ({c.score})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            onClick={() => handleSaveRule(r)}
                            disabled={
                              !manualSelections[r.paymentRowId] ||
                              saving === r.paymentRowId
                            }
                          >
                            {saving === r.paymentRowId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4 mr-1" />
                            )}
                            Guardar regla
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Guarda esta relación Pagador → Cuenta.</p>
                          <p className="text-xs mt-1">En próximas conciliaciones se asociará automáticamente.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              ))}
              {review.length === 0 && (
                <p className="text-muted-foreground py-8 text-center">
                  No hay casos a revisar.
                </p>
              )}
            </div>
          </TabsContent>
          <TabsContent value="unmatched" className="mt-4">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Elegí la cuenta/cliente para cada pagador y guardá la regla. Se usará en futuras conciliaciones.
              </p>
              {unmatched.map((r) => (
                <div
                  key={r.paymentRowId}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <p className="font-medium flex flex-wrap items-center gap-2">
                    {r.payerRaw}
                    <span className="tabular-nums">{formatAmount(r.amount ?? 0)}</span>
                    {r.sourceKind ? (
                      <Badge variant="secondary">{PAYMENT_FILE_KIND_LABEL[r.sourceKind]}</Badge>
                    ) : null}
                  </p>
                  {uniqueAccounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Cargá primero el archivo de relaciones para poder asignar manualmente.
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select
                        value={manualSelections[r.paymentRowId] ?? ""}
                        onValueChange={(v) => handleManualSelect(r.paymentRowId, v)}
                      >
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="Elegir cuenta/cliente…" />
                        </SelectTrigger>
                        <SelectContent>
                          {uniqueAccounts.map((rel) => (
                            <SelectItem key={rel.accountKey} value={rel.accountKey}>
                              {rel.accountRaw}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              onClick={() => handleSaveRule(r)}
                              disabled={
                                !manualSelections[r.paymentRowId] ||
                                saving === r.paymentRowId
                              }
                            >
                              {saving === r.paymentRowId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4 mr-1" />
                              )}
                              Guardar regla
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Guarda Pagador → Cuenta para futuras conciliaciones.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                </div>
              ))}
              {unmatched.length === 0 && (
                <p className="text-muted-foreground py-8 text-center">
                  No hay pagos sin conciliar.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>

    <AlertDialog open={confirmImpute} onOpenChange={setConfirmImpute}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Imputar pagos a clientes</AlertDialogTitle>
          <AlertDialogDescription>
            Se van a acreditar {matched.length} pagos conciliados en la cuota de{" "}
            <strong>{imputePeriod}</strong>. Busca el cliente por DNI o nombre. Si ya pagó ese mes o el
            cobro ya se imputó, no se duplica.
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
            Imputar pagos
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
