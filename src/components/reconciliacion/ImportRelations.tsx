"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Upload, Loader2, CreditCard, Banknote } from "lucide-react";
import { parseRelationsFile } from "@/lib/reconciliacion-excel/parser";
import type { PaymentFileKind, RelationRow } from "@/lib/reconciliacion-excel/types";
import { PAYMENT_FILE_KIND_LABEL } from "@/lib/reconciliacion-excel/types";

type ImportRelationsProps = {
  onRelationsLoaded: (relations: RelationRow[]) => void;
};

export function ImportRelations({ onRelationsLoaded }: ImportRelationsProps) {
  const creditRef = useRef<RelationRow[]>([]);
  const debitRef = useRef<RelationRow[]>([]);

  const emitRelations = useCallback(
    (credit: RelationRow[], debit: RelationRow[]) => {
      onRelationsLoaded([...credit, ...debit]);
    },
    [onRelationsLoaded]
  );

  const handleKindLoaded = useCallback(
    (kind: PaymentFileKind, list: RelationRow[]) => {
      if (kind === "credit") creditRef.current = list;
      else debitRef.current = list;
      emitRelations(creditRef.current, debitRef.current);
    },
    [emitRelations]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paso 1: A quién imputar</CardTitle>
        <CardDescription>
          Subí el listado interno de crédito y el de débito por separado (ej. 9 VISA CREDITO… y 9 VISA DEBITO…).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Cada archivo indica a quién asignar cada cobro: apellido, nombre, DNI, tarjeta e importe.
          No es la rendición del banco; es el padrón para imputar.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <RelationFileSlot kind="credit" onRelationsLoaded={handleKindLoaded} />
          <RelationFileSlot kind="debit" onRelationsLoaded={handleKindLoaded} />
        </div>
      </CardContent>
    </Card>
  );
}

type RelationFileSlotProps = {
  kind: PaymentFileKind;
  onRelationsLoaded: (kind: PaymentFileKind, relations: RelationRow[]) => void;
};

function RelationFileSlot({ kind, onRelationsLoaded }: RelationFileSlotProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [relations, setRelations] = useState<RelationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputId = `relations-file-${kind}`;

  const KindIcon = kind === "credit" ? CreditCard : Banknote;

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setFile(f);
      setError(null);
      setLoading(true);
      try {
        const result = await parseRelationsFile(f, kind);
        setPreview(result.preview);
        setTotalRows(result.totalRows);
        setRelations(result.relations);
        if (result.error) {
          setError(result.error);
          setRelations([]);
          onRelationsLoaded(kind, []);
        } else {
          onRelationsLoaded(kind, result.relations);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al parsear");
        setRelations([]);
        onRelationsLoaded(kind, []);
        toast({ variant: "destructive", title: "Error", description: String(err) });
      } finally {
        setLoading(false);
      }
    },
    [kind, onRelationsLoaded, toast]
  );

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <KindIcon className="h-4 w-4" />
        <h3 className="font-medium">Listado de {PAYMENT_FILE_KIND_LABEL[kind].toLowerCase()}</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Subí acá el Excel de {kind === "credit" ? "crédito" : "débito"}. Se cruza solo con la rendición de{" "}
        {kind === "credit" ? "crédito" : "débito"} del paso 2.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <TooltipProvider>
          <label className="cursor-pointer">
            <input
              id={inputId}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
              disabled={loading}
              value=""
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" asChild>
                  <span>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {relations.length > 0
                      ? `Actualizar listado de ${PAYMENT_FILE_KIND_LABEL[kind].toLowerCase()}`
                      : `Seleccionar listado de ${PAYMENT_FILE_KIND_LABEL[kind].toLowerCase()}`}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Ej. 9 VISA {kind === "credit" ? "CREDITO" : "DEBITO"} SEPTIEMBRE 2026.xlsx</p>
              </TooltipContent>
            </Tooltip>
          </label>
        </TooltipProvider>
        {relations.length > 0 && !error ? (
          <p className="text-sm text-muted-foreground">
            {relations.length} personas
            {file ? ` · ${file.name}` : ""}
          </p>
        ) : null}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {preview.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">
            Vista previa · Total: {totalRows} filas · Válidas: {relations.length}
          </p>
          <div className="overflow-x-auto rounded border max-h-32 overflow-y-auto">
            <table className="text-xs min-w-full">
              <tbody>
                {preview.slice(0, 8).map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
