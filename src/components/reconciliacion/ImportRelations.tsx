"use client";

import { useState, useCallback, useEffect } from "react";
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
import { Upload, Loader2 } from "lucide-react";
import { parseRelationsFile } from "@/lib/reconciliacion-excel/parser";
import type { RelationRow } from "@/lib/reconciliacion-excel/types";

type ImportRelationsProps = {
  schoolId: string;
  onRelationsLoaded: (relations: RelationRow[]) => void;
  initialRelations: RelationRow[];
};

export function ImportRelations({
  schoolId,
  onRelationsLoaded,
  initialRelations,
}: ImportRelationsProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [relations, setRelations] = useState<RelationRow[]>(initialRelations);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRelations(initialRelations);
  }, [initialRelations]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setFile(f);
      setError(null);
      setLoading(true);
      try {
        const result = await parseRelationsFile(f);
        setPreview(result.preview);
        setTotalRows(result.totalRows);
        setRelations(result.relations);
        if (result.error) {
          setError(result.error);
          setRelations([]);
        } else {
          onRelationsLoaded(result.relations);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al parsear");
        setRelations([]);
        toast({ variant: "destructive", title: "Error", description: String(err) });
      } finally {
        setLoading(false);
      }
    },
    [onRelationsLoaded, toast]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paso 1: A quién imputar</CardTitle>
        <CardDescription>
          Subí el listado interno (ej. 9 VISA CREDITO…). Ahí está a quién asignar cada cobro: apellido, nombre, DNI, tarjeta e importe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Este archivo no es la rendición del banco: es el padrón para imputar. Después cruzamos con los pagos de Visa.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <TooltipProvider>
            <label className="cursor-pointer">
              <input
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
                        ? "Actualizar el Excel de relaciones"
                        : "Seleccionar Excel de relaciones"}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Listado interno: apellido, nombre, DNI, tarjeta, importe.</p>
                  <p className="text-xs mt-1">Si ya cargaste uno, este botón lo reemplaza.</p>
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

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {preview.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">
              Vista previa (20 filas) · Total: {totalRows} filas · Relaciones válidas: {relations.length}
            </p>
            <div className="overflow-x-auto rounded border max-h-48 overflow-y-auto">
              <table className="text-xs min-w-full">
                <tbody>
                  {preview.map((row, i) => (
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
      </CardContent>
    </Card>
  );
}
