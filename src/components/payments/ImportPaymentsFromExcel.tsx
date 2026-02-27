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
import { Upload, Loader2, CreditCard, Banknote, Calendar } from "lucide-react";

type ColumnMapping = {
  colApellido: number;
  colNombre: number;
  colUsuarioId: number;
  colImporte: number;
  colAplicada: number;
  colObservaciones?: number;
  colNroTarjeta?: number;
};

export function ImportPaymentsFromExcel({ schoolId }: { schoolId: string }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [periodMonth, setPeriodMonth] = useState(() => new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(() => new Date().getFullYear());
  const [paymentMethod, setPaymentMethod] = useState<"credit" | "debit">("credit");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    applied: number;
    unappliedCount?: number;
    notFoundCount: number;
    notFound: string[];
    skippedCount: number;
    skipped: string[];
    sampleDbNames?: string[];
  } | null>(null);

  const parseExcel = useCallback(
    (f: File): Promise<{ headers: string[]; rows: (string | number)[][] }> => {
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
            const rawHeaders = json[0];
            const h = rawHeaders.map((x) => String(x ?? "").trim());
            const dataRows = json.slice(1).map((row) =>
              Array.isArray(row) ? [...row] : []
            );
            resolve({ headers: h, rows: dataRows });
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
      const { headers: h, rows: r } = await parseExcel(file);
      setHeaders(h);
      setRows(r);
      const def = {
        colApellido: h.findIndex((x) => /dato opcional 1|apellido/i.test(x)) >= 0
          ? h.findIndex((x) => /dato opcional 1|apellido/i.test(x))
          : 0,
        colNombre: h.findIndex((x) => /dato opcional 2|nombre/i.test(x)) >= 0
          ? h.findIndex((x) => /dato opcional 2|nombre/i.test(x))
          : 1,
        colUsuarioId: h.findIndex((x) => /id usuario|usuario/i.test(x)) >= 0
          ? h.findIndex((x) => /id usuario|usuario/i.test(x))
          : 2,
        colImporte: h.findIndex((x) => /importe/i.test(x)) >= 0
          ? h.findIndex((x) => /importe/i.test(x))
          : 4,
        colAplicada: h.findIndex((x) => /aplicada/i.test(x)) >= 0
          ? h.findIndex((x) => /aplicada/i.test(x))
          : 5,
        colNroTarjeta: h.findIndex((x) => /tarjeta/i.test(x)) >= 0
          ? h.findIndex((x) => /tarjeta/i.test(x))
          : 3,
        colObservaciones: h.findIndex((x) => /observaciones|obs/i.test(x)) >= 0
          ? h.findIndex((x) => /observaciones|obs/i.test(x))
          : undefined,
      };
      setColumns(def);
      const aplicadas = r.filter(
        (row) =>
          String(row[def.colAplicada] ?? "")
            .toLowerCase()
            .trim() === "si" ||
          String(row[def.colAplicada] ?? "")
            .toLowerCase()
            .trim() === "sí"
      ).length;
      toast({
        title: "Archivo cargado",
        description: `${r.length} filas, ${aplicadas} con Aplicada=Si. Seleccioná crédito o débito e importá.`,
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
      const period = `${periodYear}-${String(periodMonth).padStart(2, "0")}`;

      const token = await user.getIdToken();
      const res = await fetch("/api/payments/import-excel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          period,
          paymentMethod,
          rows,
          columns,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || "Error al importar");
      }

      setResult({
        applied: data.applied ?? 0,
        unappliedCount: data.unappliedCount ?? 0,
        notFoundCount: data.notFoundCount ?? 0,
        notFound: data.notFound ?? [],
        skippedCount: data.skippedCount ?? 0,
        skipped: data.skipped ?? [],
        sampleDbNames: data.sampleDbNames,
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
          <CreditCard className="h-5 w-5" />
          Importar pagos mensuales (Excel)
        </CardTitle>
        <CardDescription>
          Cargá el Excel de pagos con tarjeta (crédito o débito). Si quien paga no es el cliente (ej. titular de tarjeta),
          primero vinculá los clientes con su Id Usuario. El match es por Id Usuario; si no está vinculado, se intenta por nombre.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div>
            <input
              id="payments-excel-upload"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              type="button"
              onClick={() => document.getElementById("payments-excel-upload")?.click()}
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

        {columns && rows.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Columna Apellido (Dato Opcional 1)
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
                  Columna Nombre (Dato Opcional 2)
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
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Mes y año a cargar
                </label>
                <div className="flex gap-2">
                  <select
                    value={periodMonth}
                    onChange={(e) => setPeriodMonth(Number(e.target.value))}
                    className="rounded border bg-background px-2 py-1.5 text-sm flex-1"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>
                        {new Date(2000, m - 1).toLocaleString("es-AR", { month: "long" })}
                      </option>
                    ))}
                  </select>
                  <select
                    value={periodYear}
                    onChange={(e) => setPeriodYear(Number(e.target.value))}
                    className="rounded border bg-background px-2 py-1.5 text-sm w-24"
                  >
                    {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(
                      (y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  Tipo de pago
                </label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={paymentMethod === "credit" ? "default" : "outline"}
                    onClick={() => setPaymentMethod("credit")}
                  >
                    <CreditCard className="mr-1 h-4 w-4" />
                    Crédito
                  </Button>
                  <Button
                    size="sm"
                    variant={paymentMethod === "debit" ? "default" : "outline"}
                    onClick={() => setPaymentMethod("debit")}
                  >
                    <Banknote className="mr-1 h-4 w-4" />
                    Débito
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Los pagos aplicados se imputan a la cuota más vieja de cada cliente. Período {periodYear}-{String(periodMonth).padStart(2, "0")} para no aplicados • {rows.length} filas
            </p>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando…
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Importar pagos ({paymentMethod === "credit" ? "crédito" : "débito"})
                </>
              )}
            </Button>
          </div>
        )}

        {result && (
          <div className="text-sm space-y-2 p-3 rounded-md bg-muted/50">
            <p className="font-medium text-green-600 dark:text-green-400">
              ✓ Acreditados: {result.applied}
            </p>
            {result.unappliedCount != null && result.unappliedCount > 0 && (
              <p className="text-amber-600 dark:text-amber-400">
                No aplicados (con observaciones): {result.unappliedCount} — Ver pestaña &quot;No aplicados&quot;
              </p>
            )}
            {result.notFoundCount > 0 && (
              <div className="text-amber-600 dark:text-amber-400 space-y-1">
                <p>No encontrados: {result.notFoundCount}</p>
                <details className="text-xs">
                  <summary className="cursor-pointer">Ver ejemplos del Excel</summary>
                  <p className="mt-1 break-all">
                    {result.notFound.slice(0, 20).join(" • ")}
                    {result.notFound.length > 20 && " …"}
                  </p>
                </details>
                {result.sampleDbNames && result.sampleDbNames.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer">Ver ejemplos en la base de datos</summary>
                    <p className="mt-1 break-all text-muted-foreground">
                      {result.sampleDbNames.join(" • ")}
                    </p>
                    <p className="mt-1 text-muted-foreground italic">
                      Si quien paga (titular de tarjeta) no es el cliente, vinculá primero con &quot;Vincular Id Usuario&quot;.
                    </p>
                  </details>
                )}
              </div>
            )}
            {result.skippedCount > 0 && (
              <p className="text-muted-foreground">
                Omitidos: {result.skippedCount}
                {result.skipped.length > 0 && (
                  <span className="block text-xs mt-1 truncate">
                    Ej: {result.skipped.slice(0, 2).join(", ")}
                    {result.skipped.length > 2 && "…"}
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
