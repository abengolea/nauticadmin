"use client";

import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { useUser } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import {
  EXCEL_FIELD_MAP,
  type ExcelFieldKey,
} from "@/lib/excel-import-types";

type ColumnMapping = {
  columnIndex: number;
  columnHeader: string;
  systemField: ExcelFieldKey;
  confidence?: number;
};

export function ImportClientsFromExcel({ schoolId }: { schoolId: string }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [notes, setNotes] = useState<string | undefined>();
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

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
          const headers = rawHeaders.map((h) => String(h ?? "").trim());
          const dataRows = json.slice(1).map((row) =>
            Array.isArray(row)
              ? row.map((c) => String(c ?? "").trim())
              : []
          );
          resolve({ headers, rows: dataRows });
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
        description: "Solo se aceptan archivos Excel (.xlsx, .xls)",
      });
      return;
    }
    setFile(f);
    setHeaders([]);
    setRows([]);
    setMappings([]);
    setNotes(undefined);
    setImported(null);
  };

  const handleAnalyze = async () => {
    if (!file || !user) return;
    setAnalyzing(true);
    try {
      const { headers: h, rows: r } = await parseExcel(file);
      setHeaders(h);
      setRows(r);

      const sampleRows = r.slice(0, 5);
      const token = await user.getIdToken();
      const res = await fetch("/api/clients/import/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          headers: h,
          sampleRows,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || "Error al analizar");
      }

      setMappings(data.mappings ?? []);
      setNotes(data.notes);

      toast({
        title: "Análisis completado",
        description: `Se detectaron ${data.mappings?.length ?? 0} columnas. Revisá el mapeo y hacé clic en Importar.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error al analizar",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImport = async () => {
    if (!user || rows.length === 0 || mappings.length === 0) return;
    setImporting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/clients/import/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          rows,
          mappings,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || "Error al importar");
      }

      setImported(data.created ?? 0);
      toast({
        title: "Importación exitosa",
        description: `Se importaron ${data.created} clientes.`,
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

  const updateMapping = (idx: number, systemField: ExcelFieldKey) => {
    setMappings((prev) =>
      prev.map((m, i) =>
        i === idx ? { ...m, systemField } : m
      )
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Importar clientes desde Excel
        </CardTitle>
        <CardDescription>
          Subí un archivo Excel con tus clientes. La IA analizará las columnas y sugerirá el mapeo automático a la base de datos (propietario, embarcación, matrícula, ubicación, etc.).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div>
            <input
              id="excel-upload"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              type="button"
              onClick={() => document.getElementById("excel-upload")?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Elegir archivo Excel
            </Button>
          </div>
          {file && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="truncate max-w-[200px]">{file.name}</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAnalyze}
                disabled={analyzing}
              >
                {analyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analizando con IA…
                  </>
                ) : (
                  "Analizar con IA"
                )}
              </Button>
            </div>
          )}
        </div>

        {notes && (
          <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
            {notes}
          </p>
        )}

        {mappings.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-medium">Mapeo de columnas</h4>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2">Columna Excel</th>
                    <th className="text-left p-2">Campo del sistema</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="p-2">{m.columnHeader || `Col ${m.columnIndex + 1}`}</td>
                      <td className="p-2">
                        <select
                          value={m.systemField}
                          onChange={(e) =>
                            updateMapping(idx, e.target.value as ExcelFieldKey)
                          }
                          className="w-full max-w-[220px] rounded border bg-background px-2 py-1 text-sm"
                        >
                          {Object.entries(EXCEL_FIELD_MAP).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-sm text-muted-foreground">
              {rows.length} filas a importar. Podés ajustar el mapeo antes de importar.
            </p>

            <Button
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Importar {rows.length} clientes
                </>
              )}
            </Button>
          </div>
        )}

        {imported !== null && (
          <p className="text-sm text-green-600 dark:text-green-400 font-medium">
            ✓ Se importaron {imported} clientes correctamente.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
