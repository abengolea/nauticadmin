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
import { Upload, Loader2, Calendar } from "lucide-react";

/** Convierte valor de celda a fecha legible. Excel guarda fechas como número serial (ej: 45812 = 6/4/2025). */
function toDateString(val: unknown): string {
  const str = String(val ?? "").trim();
  if (!str) return str;
  const num = parseFloat(str);
  if (!Number.isNaN(num) && str === String(num) && num >= 1 && num < 100000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    }
  }
  return str;
}

export function ImportClienteDesde({ schoolId }: { schoolId: string }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [colApellidoNombres, setColApellidoNombres] = useState<number>(0);
  const [colClienteDesde, setColClienteDesde] = useState<number>(1);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    updated: number;
    notFoundCount: number;
    notFound: string[];
  } | null>(null);

  const parseExcel = useCallback((f: File): Promise<{ headers: string[]; rows: string[][] }> => {
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
          const json = XLSX.utils.sheet_to_json<string[]>(firstSheet, {
            header: 1,
            defval: "",
          }) as string[][];
          if (json.length === 0) {
            reject(new Error("El archivo está vacío"));
            return;
          }
          const rawHeaders = json[0];
          const h = rawHeaders.map((x) => String(x ?? "").trim());
          const dataRows = json.slice(1).map((row) =>
            Array.isArray(row) ? row.map((c) => String(c ?? "").trim()) : []
          );
          resolve({ headers: h, rows: dataRows });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Error al leer el archivo"));
      reader.readAsBinaryString(f);
    });
  }, []);

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
    setResult(null);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const { headers: h, rows: r } = await parseExcel(file);
      setHeaders(h);
      setRows(r);
      setColApellidoNombres(0);
      setColClienteDesde(Math.min(1, h.length - 1));
      toast({
        title: "Archivo cargado",
        description: `${r.length} filas. Seleccioná las columnas y hacé clic en Importar.`,
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
    if (!user || rows.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const items = rows.map((row) => ({
        apellidoNombres: String(row[colApellidoNombres] ?? "").trim(),
        clienteDesde: toDateString(row[colClienteDesde]),
      })).filter((i) => i.apellidoNombres && i.clienteDesde);

      if (items.length === 0) {
        toast({
          variant: "destructive",
          title: "Sin datos",
          description: "No hay filas con Apellido Nombres y Cliente desde completos.",
        });
        setImporting(false);
        return;
      }

      const token = await user.getIdToken();
      const res = await fetch("/api/clients/import/cliente-desde", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ schoolId, items }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || "Error al importar");
      }

      setResult({
        updated: data.updated ?? 0,
        notFoundCount: data.notFoundCount ?? 0,
        notFound: data.notFound ?? [],
      });
      toast({
        title: "Importación completada",
        description: data.message,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error al importar",
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
          <Calendar className="h-5 w-5" />
          Importar solo &quot;Cliente desde&quot;
        </CardTitle>
        <CardDescription>
          Si el campo &quot;Cliente desde&quot; no se importó bien, subí un Excel con 2 columnas: Apellido Nombres y la fecha. Se asignará automáticamente a cada cliente existente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div>
            <input
              id="cliente-desde-upload"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              type="button"
              onClick={() => document.getElementById("cliente-desde-upload")?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Elegir archivo
            </Button>
          </div>
          {file && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="truncate max-w-[200px]">{file.name}</span>
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

        {headers.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Columnas</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Columna Apellido Nombres
                </label>
                <select
                  value={colApellidoNombres}
                  onChange={(e) => setColApellidoNombres(Number(e.target.value))}
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
                  Columna Cliente desde (fecha)
                </label>
                <select
                  value={colClienteDesde}
                  onChange={(e) => setColClienteDesde(Number(e.target.value))}
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
              {rows.length} filas. El match se hace por nombre (Apellido Nombres).
            </p>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando…
                </>
              ) : (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  Importar Cliente desde
                </>
              )}
            </Button>
          </div>
        )}

        {result && (
          <div className="text-sm space-y-1 p-3 rounded-md bg-muted/50">
            <p className="font-medium text-green-600 dark:text-green-400">
              ✓ Actualizados: {result.updated}
            </p>
            {result.notFoundCount > 0 && (
              <p className="text-amber-600 dark:text-amber-400">
                No encontrados: {result.notFoundCount}
                {result.notFound.length > 0 && (
                  <span className="block text-xs mt-1 truncate">
                    Ej: {result.notFound.slice(0, 3).join(", ")}
                    {result.notFound.length > 3 && "…"}
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
