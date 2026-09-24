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
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, AlertCircle, XCircle, Loader2, Save, UserCheck, FlaskConical, HelpCircle } from "lucide-react";
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

type ImputeSummary = {
  applied: number;
  already: number;
  alreadyPaidPeriod?: number;
  period?: string;
  notFoundCount: number;
  notFound: string[];
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

type ReconciliationResultsProps = {
  schoolId: string;
  results: ReconciliationResult[];
  relations: RelationRow[];
  imputePeriod: string;
  onSaveRule: (payerRaw: string, accountKey: string, accountRaw: string) => Promise<void>;
};

export function ReconciliationResults({
  schoolId,
  results,
  relations,
  imputePeriod,
  onSaveRule,
}: ReconciliationResultsProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [manualSelections, setManualSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmImpute, setConfirmImpute] = useState(false);
  const [imputing, setImputing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [imputeSummary, setImputeSummary] = useState<ImputeSummary | null>(null);
  const [approvedFuzzy, setApprovedFuzzy] = useState<Set<string>>(new Set());

  const matched = results.filter((r) => r.status === "MATCHED");
  const doubtfulList = imputeSummary?.doubtful ?? [];
  const pendingDoubtful = imputeSummary?.pendingDoubtfulCount ?? doubtfulList.length;
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

  const findRelationForResult = (r: ReconciliationResult) =>
    relations.find(
      (rel) =>
        rel.accountKey === r.matchedAccountKey &&
        (!rel.cardLast4 || !r.cardLast4 || rel.cardLast4 === r.cardLast4)
    ) ?? relations.find((rel) => rel.accountKey === r.matchedAccountKey);

  const formatAmount = (n: number) =>
    `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const matchedTotal = matched.reduce((s, r) => s + (r.amount ?? 0), 0);

  const buildImputeItems = useCallback((): ImputePaymentItem[] => {
    return matched
      .filter((r) => r.matchedAccountKey && (r.amount ?? 0) > 0)
      .map((r) => {
        const rel = findRelationForResult(r);
        return {
          paymentRowId: r.paymentRowId,
          payerRaw: r.payerRaw,
          amount: r.amount ?? 0,
          accountKey: r.matchedAccountKey!,
          accountRaw: rel?.accountRaw ?? getAccountRaw(r.matchedAccountKey!),
          sourceKind: r.sourceKind,
          aplicada: r.aplicada,
          cardLast4: r.cardLast4,
          dni: rel?.dni,
          listadoLastName: rel?.listadoLastName,
          listadoFirstName: rel?.listadoFirstName,
          imputeToRaw: rel?.imputeToRaw,
        };
      });
  }, [matched, relations]);

  const handleSimulate = useCallback(async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Tenés que iniciar sesión" });
      return;
    }
    const items = buildImputeItems();
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
            approvedFuzzy: [...approvedFuzzy],
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo simular");
      }
      setImputeSummary(data);
      setApprovedFuzzy(new Set());
      toast({ title: "Simulación lista", description: data.message });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error al simular",
        description: err instanceof Error ? err.message : "No se pudo simular",
      });
    } finally {
      setSimulating(false);
    }
  }, [user, buildImputeItems, schoolId, toast, imputePeriod, approvedFuzzy]);

  const toggleDoubtful = useCallback((paymentRowId: string, checked: boolean) => {
    setApprovedFuzzy((prev) => {
      const next = new Set(prev);
      if (checked) next.add(paymentRowId);
      else next.delete(paymentRowId);
      return next;
    });
  }, []);

  const approveAllDoubtful = useCallback(() => {
    setApprovedFuzzy(new Set(doubtfulList.map((d) => d.paymentRowId)));
  }, [doubtfulList]);

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
            approvedFuzzy: [...approvedFuzzy],
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo imputar");
      }
      setImputeSummary({ ...data, simulate: false });
      setApprovedFuzzy(new Set());
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
  }, [user, buildImputeItems, schoolId, toast, imputePeriod, approvedFuzzy]);

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
          {pendingDoubtful > 0 ? ` · ${pendingDoubtful} dudosos sin confirmar` : ""}
        </CardDescription>
        <p className="text-xs text-muted-foreground pt-1">
          Cliente del listado (col G) = quien recibe la cuota y la factura. Simulá primero; los matches
          aproximados van a «A confirmar».
        </p>
        {matched.length > 0 ? (
          <div className="pt-2 flex flex-wrap items-end gap-3">
            <p className="text-sm text-muted-foreground">
              Cuota seleccionada: <strong>{imputePeriod}</strong>
            </p>
            <Button
              variant="secondary"
              onClick={() => void handleSimulate()}
              disabled={imputing || simulating}
            >
              {simulating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <FlaskConical className="h-4 w-4 mr-2" />
              )}
              Simular imputación
            </Button>
            <Button onClick={() => setConfirmImpute(true)} disabled={imputing || simulating}>
              {imputing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserCheck className="h-4 w-4 mr-2" />
              )}
              Imputar pagos
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {imputeSummary ? (
          <Alert className="mb-4">
            <AlertDescription>
              {imputeSummary.simulate ? (
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Simulación — no se guardó nada
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
              {(imputeSummary.pendingDoubtfulCount ?? 0) > 0 ? (
                <p className="mt-2 text-sm">
                  <strong>{imputeSummary.pendingDoubtfulCount} dudosos:</strong> revisá la pestaña
                  «A confirmar», marcá OK y volvé a simular o imputá.
                </p>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <Tabs defaultValue={pendingDoubtful > 0 ? "doubtful" : "matched"} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="matched" className="gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Conciliados ({matched.length})
            </TabsTrigger>
            <TabsTrigger value="doubtful" className="gap-1">
              <HelpCircle className="h-4 w-4" />
              A confirmar ({doubtfulList.length || pendingDoubtful})
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
          <TabsContent value="doubtful" className="mt-4 space-y-3">
            {doubtfulList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {imputeSummary
                  ? "No hay matches dudosos. Ejecutá «Simular imputación» para clasificar."
                  : "Simulá la imputación para ver sugerencias a confirmar."}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={approveAllDoubtful}>
                    Confirmar todos ({doubtfulList.length})
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleSimulate()}
                    disabled={simulating}
                  >
                    Re-simular con confirmados
                  </Button>
                </div>
                <div className="rounded border overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">OK</TableHead>
                        <TableHead>Cliente listado (col G)</TableHead>
                        <TableHead>Sugerido en NauticAdmin</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                        <TableHead>Match</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {doubtfulList.map((d) => (
                        <TableRow key={d.paymentRowId}>
                          <TableCell>
                            <Checkbox
                              checked={approvedFuzzy.has(d.paymentRowId)}
                              onCheckedChange={(c) =>
                                toggleDoubtful(d.paymentRowId, c === true)
                              }
                            />
                          </TableCell>
                          <TableCell>{d.targetName}</TableCell>
                          <TableCell>{d.suggestedPlayerName}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatAmount(d.amount)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {Math.round(d.score * 100)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
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
