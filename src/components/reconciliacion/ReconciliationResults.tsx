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
import { CheckCircle2, XCircle, Loader2, UserCheck, FlaskConical, HelpCircle, Link2, Undo2 } from "lucide-react";
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
};

export function ReconciliationResults({
  schoolId,
  results,
  relations,
  imputePeriod,
}: ReconciliationResultsProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [manualSelections, setManualSelections] = useState<Record<string, string>>({});
  /** Pagador → cliente del listado, solo para esta conciliación */
  const [manualResolved, setManualResolved] = useState<Record<string, string>>({});
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
        };
      });
  }, [allResolved, relations]);

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
          {allResolved.length} conciliados
          {manualResolvedCount > 0 ? ` (${manualResolvedCount} manual)` : ""}
          {pendingManualCount > 0 ? ` · ${pendingManualCount} sin conciliar` : ""}
          {allResolved.length > 0 ? ` · total pagado ${formatAmount(resolvedTotal)}` : ""}
          {pendingDoubtful > 0 ? ` · ${pendingDoubtful} dudosos sin confirmar` : ""}
        </CardDescription>
        <p className="text-xs text-muted-foreground pt-1">
          Cliente del listado (col G) = quien recibe la cuota y la factura. En «Sin conciliar» asigná pagador →
          cliente una vez; entra en simular/imputar. Los matches aproximados van a «A confirmar».
        </p>
        {allResolved.length > 0 ? (
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
        <Tabs
          defaultValue={
            pendingManualCount > 0
              ? "unmatched"
              : pendingDoubtful > 0
                ? "doubtful"
                : "matched"
          }
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="matched" className="gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Conciliados ({allResolved.length})
            </TabsTrigger>
            <TabsTrigger value="doubtful" className="gap-1">
              <HelpCircle className="h-4 w-4" />
              A confirmar ({doubtfulList.length || pendingDoubtful})
            </TabsTrigger>
            <TabsTrigger value="unmatched" className="gap-1">
              <XCircle className="h-4 w-4" />
              Sin conciliar ({pendingManualCount})
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
          <AlertDialogTitle>Imputar pagos a clientes</AlertDialogTitle>
          <AlertDialogDescription>
            Se van a acreditar {allResolved.length} pagos conciliados en la cuota de{" "}
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
