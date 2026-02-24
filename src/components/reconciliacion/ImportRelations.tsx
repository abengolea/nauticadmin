"use client";

import { useState, useCallback, useEffect } from "react";
import { useUser } from "@/firebase";
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
import { Upload, Loader2, CheckCircle2 } from "lucide-react";
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
  const { user } = useUser();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const handleSave = useCallback(async () => {
    if (!user || relations.length === 0) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/reconciliation/payer-mappings?schoolId=${encodeURIComponent(schoolId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            relations: relations.map((r) => ({
              ...r,
              createdAt: r.createdAt || new Date().toISOString(),
            })),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      toast({ title: "Guardado", description: data.message ?? `${data.saved} relaciones guardadas` });
      onRelationsLoaded(relations);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudieron guardar las relaciones",
      });
    } finally {
      setSaving(false);
    }
  }, [user, schoolId, relations, onRelationsLoaded, toast]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paso 1: Archivo de Relaciones</CardTitle>
        <CardDescription>
          Subí el Excel/CSV con columnas &quot;AYB (Cuenta)&quot; y &quot;Pagador (Col G)&quot;. Se toleran variantes de nombre.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Primero subí el archivo con las relaciones Cuenta ↔ Pagador. Luego guardalo para usarlas en la conciliación.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <TooltipProvider>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
                disabled={loading}
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
                      {file ? file.name : "Seleccionar archivo"}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Subí el Excel/CSV con columnas AYB (Cuenta) y Pagador.</p>
                  <p className="text-xs mt-1">Se detectan automáticamente variantes de nombre.</p>
                </TooltipContent>
              </Tooltip>
            </label>
            {relations.length > 0 && !error && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Guardar {relations.length} relaciones
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Persistí las relaciones en el sistema.</p>
                  <p className="text-xs mt-1">Se usarán en esta y futuras conciliaciones.</p>
                </TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
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
