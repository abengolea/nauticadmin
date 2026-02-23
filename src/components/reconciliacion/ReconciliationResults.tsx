"use client";

import { useState, useCallback } from "react";
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
import { CheckCircle2, AlertCircle, XCircle, Loader2, Save } from "lucide-react";
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
import type {
  ReconciliationResult,
  RelationRow,
  AuditLogEntry,
} from "@/lib/reconciliacion-excel/types";

type ReconciliationResultsProps = {
  results: ReconciliationResult[];
  relations: RelationRow[];
  onSaveRule: (payerRaw: string, accountKey: string, accountRaw: string) => Promise<void>;
};

export function ReconciliationResults({
  results,
  relations,
  onSaveRule,
}: ReconciliationResultsProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [manualSelections, setManualSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

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
      const accountRaw = cand?.accountRaw ?? accountKey;
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
    [manualSelections, onSaveRule, toast]
  );

  const getAccountRaw = (accountKey: string) =>
    relations.find((r) => r.accountKey === accountKey)?.accountRaw ?? accountKey;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resultados de conciliación</CardTitle>
        <CardDescription>
          {matched.length} conciliados · {review.length} a revisar · {unmatched.length} sin conciliar
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                    <TableHead>Cuenta asignada</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matched.map((r) => (
                    <TableRow key={r.paymentRowId}>
                      <TableCell>{r.payerRaw}</TableCell>
                      <TableCell>
                        {r.matchedAccountKey
                          ? getAccountRaw(r.matchedAccountKey)
                          : "—"}
                      </TableCell>
                      <TableCell>{r.matchType}</TableCell>
                      <TableCell>{Math.round(r.score * 100)}</TableCell>
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
                  <p className="font-medium">{r.payerRaw}</p>
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
            <div className="rounded border overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pagador</TableHead>
                    <TableHead>Score máximo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatched.map((r) => (
                    <TableRow key={r.paymentRowId}>
                      <TableCell>{r.payerRaw}</TableCell>
                      <TableCell>
                        {r.candidateAccounts[0]
                          ? `${r.candidateAccounts[0].accountRaw} (${r.candidateAccounts[0].score})`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
