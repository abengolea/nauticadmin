"use client";

import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
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
import { Upload, Loader2, Link2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type ColumnMapping = {
  colApellido: number;
  colNombre: number;
  colPagador: number;
};

export function ImportAliasesFromExcel({ schoolId }: { schoolId: string }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    notFoundCount: number;
    notFound: string[];
    conflictsCount?: number;
    conflicts?: string[];
  } | null>(null);

  const parseExcel = useCallback(
    (f: File): Promise<{ json: (string | number)[][] }> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = e.target?.result;
            if (!data) {
              reject(new Error("No se pudo leer el archivo"));
              return;
            }
            const workbook = XLSX.read(data, { type: "binary" });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json<(string | number)[]>(firstSheet, {
              header: 1,
              defval: "",
              raw: false,
            }) as (string | number)[][];
            if (json.length === 0) {
              reject(new Error("El archivo está vacío"));
              return;
            }
            resolve({ json });
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error("Error al leer el archivo"));
        reader.readAsBinaryString(f);
      });
    },
    []
  );

  const [columns, setColumns] = useState<ColumnMapping | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls"].includes(ext ?? "")) {
      toast({
        variant: "destructive",
        title: "Formato no válido",
        description: "Solo se aceptan archivos Excel (.xlsx, .xls).",
      });
      return;
    }
    setFile(f);
    setHeaders([]);
    setRows([]);
    setColumns(null);
    setResult(null);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const { json } = await parseExcel(file);
      const actualRows = hasHeaders ? json.slice(1) : json;
      const firstRow = json[0] ?? [];
      const maxCols = Math.max(
        Array.isArray(firstRow) ? firstRow.length : 0,
        ...actualRows.map((row) => (Array.isArray(row) ? row.length : 0)),
        7
      );
      const actualHeaders = hasHeaders
        ? (firstRow as (string | number)[]).map((x) => String(x ?? "").trim())
        : Array.from({ length: maxCols }, (_, i) =>
            i < 26 ? `Col ${String.fromCharCode(65 + i)}` : `Col ${i + 1}`
          );
      setHeaders(actualHeaders);
      setRows(actualRows.map((row) => (Array.isArray(row) ? [...row] : [])));
      const def: ColumnMapping = {
        colApellido: actualHeaders.findIndex((x) => /apellido|dato 1|dato opcional 1|col a/i.test(x)) >= 0
          ? actualHeaders.findIndex((x) => /apellido|dato 1|dato opcional 1|col a/i.test(x))
          : 0,
        colNombre: actualHeaders.findIndex((x) => /nombre|dato 2|dato opcional 2|cliente|cuenta|col b/i.test(x)) >= 0
          ? actualHeaders.findIndex((x) => /nombre|dato 2|dato opcional 2|cliente|cuenta|col b/i.test(x))
          : 1,
        colPagador: actualHeaders.findIndex((x) => /pagador|titular|razon social|razón social|col g|col 7/i.test(x)) >= 0
          ? actualHeaders.findIndex((x) => /pagador|titular|razon social|razón social|col g|col 7/i.test(x))
          : 6,
      };
      setColumns(def);
      const conPagador = actualRows.filter(
        (row) => String((Array.isArray(row) ? row[def.colPagador] : undefined) ?? "").trim() !== ""
      ).length;
      toast({
        title: "Archivo cargado",
        description: `${actualRows.length} filas, ${conPagador} con pagador. Revisá el mapeo de columnas y cargá.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error al leer",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    if (!user || rows.length === 0 || !columns) return;
    setImporting(true);
    setResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/payments/import-aliases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          rows,
          columns,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || "Error al cargar alias");
      }

      setResult({
        created: data.created ?? 0,
        updated: data.updated ?? 0,
        notFoundCount: data.notFoundCount ?? 0,
        notFound: data.notFound ?? [],
        conflictsCount: data.conflictsCount ?? 0,
        conflicts: data.conflicts ?? [],
      });
      toast({
        title: "Carga completada",
        description: data.message,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error al cargar",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Cargar alias pagador → cliente (conciliación)
        </CardTitle>
        <CardDescription>
          Subí el Excel del banco (ej. Visa Crédito) con columna de pagador. Col A/B: apellido y nombre del cliente, Col G: pagador.
          Crea los alias en recPayerAliases para que la conciliación y el import de pagos sepan a qué cliente imputar cada pagador.
          Si un pagador figura para varios clientes, no se asigna y se muestra como conflicto para revisar manualmente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="has-headers"
              checked={hasHeaders}
              onCheckedChange={setHasHeaders}
            />
            <Label htmlFor="has-headers" className="text-sm">
              La primera fila es encabezado (desactivar si el Excel no tiene títulos de columna)
            </Label>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div>
              <input
              id="aliases-excel-upload"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              type="button"
              onClick={() => document.getElementById("aliases-excel-upload")?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Elegir archivo Excel
            </Button>
          </div>
          {file && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                {file.name}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAnalyze}
                disabled={importing}
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cargando…
                  </>
                ) : (
                  "Cargar"
                )}
              </Button>
            </div>
          )}
          </div>
        </div>

        {columns && rows.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Columna Apellido (A)
                </label>
                <select
                  value={columns.colApellido}
                  onChange={(e) =>
                    setColumns((c) => c && { ...c, colApellido: Number(e.target.value) })
                  }
                  className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                >
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Col ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Columna Nombre (B)
                </label>
                <select
                  value={columns.colNombre}
                  onChange={(e) =>
                    setColumns((c) => c && { ...c, colNombre: Number(e.target.value) })
                  }
                  className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                >
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Col ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Columna Pagador (G)
                </label>
                <select
                  value={columns.colPagador}
                  onChange={(e) =>
                    setColumns((c) => c && { ...c, colPagador: Number(e.target.value) })
                  }
                  className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                >
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Col ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Se crearán/actualizarán alias: pagador → cliente. {rows.length} filas.
            </p>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando alias…
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  Cargar alias
                </>
              )}
            </Button>
          </div>
        )}

        {result && (
          <div className="text-sm space-y-2 p-3 rounded-md bg-muted/50">
            <p className="font-medium text-green-600 dark:text-green-400">
              ✓ Alias creados: {result.created} · Actualizados: {result.updated}
            </p>
            {result.conflictsCount != null && result.conflictsCount > 0 && (
              <div className="text-amber-600 dark:text-amber-400 space-y-1">
                <p className="font-medium">Conflictos (revisar manualmente): {result.conflictsCount}</p>
                <p className="text-xs">
                  Un pagador figura para varios clientes distintos. No se asignó; decidí a cuál cliente corresponde.
                </p>
                <details className="text-xs">
                  <summary className="cursor-pointer">Ver conflictos</summary>
                  <ul className="mt-1 list-disc list-inside space-y-1">
                    {result.conflicts?.slice(0, 20).map((c, i) => (
                      <li key={i} className="break-words">{c}</li>
                    ))}
                    {(result.conflicts?.length ?? 0) > 20 && " …"}
                  </ul>
                </details>
              </div>
            )}
            {result.notFoundCount > 0 && (
              <div className="text-amber-600 dark:text-amber-400 space-y-1">
                <p>Clientes no encontrados: {result.notFoundCount}</p>
                <details className="text-xs">
                  <summary className="cursor-pointer">Ver ejemplos</summary>
                  <p className="mt-1 break-all">
                    {result.notFound.slice(0, 15).join(" • ")}
                    {result.notFound.length > 15 && " …"}
                  </p>
                  <p className="mt-1 text-muted-foreground italic">
                    Verificá que el nombre coincida con el cliente en la base (apellido y nombre).
                  </p>
                </details>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
