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
import { Upload, Loader2, FileSpreadsheet, ArrowRight } from "lucide-react";
import Link from "next/link";

export function ReconciliationImport({ schoolId }: { schoolId: string }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [fileClientes, setFileClientes] = useState<File | null>(null);
  const [filePagos, setFilePagos] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{
    import_batch_id: string;
    clients_count: number;
    payments_count: number;
    auto_count: number;
    review_count: number;
    nomatch_count: number;
    conflict_count: number;
  } | null>(null);

  const parseExcel = useCallback(
    (f: File): Promise<(string | number)[][]> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = e.target?.result;
            if (!data) {
              reject(new Error("No se pudo leer el archivo"));
              return;
            }
            const wb = XLSX.read(data, { type: "binary" });
            const ws = wb.Sheets[wb.SheetNames[0]!];
            const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
              header: 1,
              defval: "",
            }) as (string | number)[][];
            resolve(rows);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error("Error al leer"));
        reader.readAsBinaryString(f);
      }),
    []
  );

  const handleProcess = async () => {
    if (!user || !fileClientes || !filePagos) {
      toast({
        variant: "destructive",
        title: "Faltan archivos",
        description: "Subí ambos Excel: Clientes y Pagos.",
      });
      return;
    }
    setProcessing(true);
    setResult(null);
    try {
      const [clientsRows, paymentsRows] = await Promise.all([
        parseExcel(fileClientes),
        parseExcel(filePagos),
      ]);

      const token = await user.getIdToken();
      const res = await fetch("/api/reconciliation/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          clientsRows,
          paymentsRows,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || "Error al procesar");
      }

      setResult({
        import_batch_id: data.import_batch_id,
        clients_count: data.clients_count,
        payments_count: data.payments_count,
        auto_count: data.auto_count,
        review_count: data.review_count,
        nomatch_count: data.nomatch_count,
        conflict_count: data.conflict_count,
      });
      toast({
        title: "Procesamiento completado",
        description: data.message,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Importar Excel
        </CardTitle>
        <CardDescription>
          Subí el Excel de Clientes (padrón) y el de Pagos con tarjeta. La app normalizará nombres,
          hará matching y generará la conciliación.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium block mb-2">
              A) Excel Clientes (padrón)
            </label>
            <p className="text-xs text-muted-foreground mb-1">
              Columna: &quot;Apellido Nombres&quot; o &quot;Razón Social&quot;
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFileClientes(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            {fileClientes && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {fileClientes.name}
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium block mb-2">
              B) Excel Pagos con tarjeta
            </label>
            <p className="text-xs text-muted-foreground mb-1">
              Columnas: Dato Opcional 1, 2, Id Usuario, Nro Tarjeta, Importe, Aplicada
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFilePagos(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            {filePagos && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {filePagos.name}
              </p>
            )}
          </div>
        </div>

        <Button onClick={handleProcess} disabled={processing}>
          {processing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Procesando…
            </>
          ) : (
            <>
              <ArrowRight className="mr-2 h-4 w-4" />
              Procesar
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-4 p-4 rounded-lg bg-muted/50">
            <p className="font-medium">Resumen</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Clientes</span>
                <p className="font-semibold">{result.clients_count}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Pagos</span>
                <p className="font-semibold">{result.payments_count}</p>
              </div>
              <div>
                <span className="text-green-600">Auto-imputados</span>
                <p className="font-semibold">{result.auto_count}</p>
              </div>
              <div>
                <span className="text-amber-600">Revisar / Sin match</span>
                <p className="font-semibold">
                  {result.review_count + result.nomatch_count + result.conflict_count}
                </p>
              </div>
            </div>
            <Button asChild>
              <Link href={`/dashboard/reconciliation?tab=conciliacion&batch=${result.import_batch_id}`}>
                Ir a Conciliación
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
