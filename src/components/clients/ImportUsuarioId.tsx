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
import { Upload, Loader2, UserCheck } from "lucide-react";

export function ImportUsuarioId({ schoolId }: { schoolId: string }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [colApellidoNombres, setColApellidoNombres] = useState<number>(0);
  const [colUsuarioId, setColUsuarioId] = useState<number>(1);
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
      const idxId = h.findIndex((x) => /id usuario|usuario/i.test(x));
      setColApellidoNombres(idxId === 0 ? 1 : 0);
      setColUsuarioId(idxId >= 0 ? idxId : 1);
      toast({
        title: "Archivo cargado",
        description: `${r.length} filas. El nombre debe ser del CLIENTE (dueño), no del titular de la tarjeta.`,
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
        usuarioId: String(row[colUsuarioId] ?? "").trim(),
      })).filter((i) => i.apellidoNombres && i.usuarioId);

      if (items.length === 0) {
        toast({
          variant: "destructive",
          title: "Sin datos",
          description: "No hay filas con nombre e Id Usuario completos.",
        });
        setImporting(false);
        return;
      }

      const token = await user.getIdToken();
      const res = await fetch("/api/clients/import/usuario-id", {
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
        title: "Vinculación completada",
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
          <UserCheck className="h-5 w-5" />
          Vincular Id Usuario (app de pagos)
        </CardTitle>
        <CardDescription>
          Si quien paga con tarjeta no es el cliente (dueño de la embarcación), el match debe ser por Id Usuario.
          Subí un Excel con el listado de clientes de la app de pagos (nombre del cliente + Id Usuario) para vincularlos.
          Después podrás importar pagos correctamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div>
            <input
              id="usuario-id-upload"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              type="button"
              onClick={() => document.getElementById("usuario-id-upload")?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Elegir archivo
            </Button>
          </div>
          {file && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="truncate max-w-[200px]">{file.name}</span>
              <Button size="sm" variant="secondary" onClick={handleAnalyze} disabled={importing}>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Columna Nombre del cliente
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
                  Columna Id Usuario
                </label>
                <select
                  value={colUsuarioId}
                  onChange={(e) => setColUsuarioId(Number(e.target.value))}
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
              {rows.length} filas. El nombre debe coincidir con el cliente en NauticAdmin (dueño de la embarcación).
            </p>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Vinculando…
                </>
              ) : (
                <>
                  <UserCheck className="mr-2 h-4 w-4" />
                  Vincular Id Usuario
                </>
              )}
            </Button>
          </div>
        )}

        {result && (
          <div className="text-sm space-y-1 p-3 rounded-md bg-muted/50">
            <p className="font-medium text-green-600 dark:text-green-400">
              ✓ Vinculados: {result.updated}
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
