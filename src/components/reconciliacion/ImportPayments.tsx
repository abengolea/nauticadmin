"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";
import { parsePaymentsFile, getHeadersFromFile } from "@/lib/reconciliacion-excel/parser";
import { ColumnMappingComponent } from "./ColumnMapping";
import type { PaymentRow, ColumnMapping } from "@/lib/reconciliacion-excel/types";

type ImportPaymentsProps = {
  onPaymentsLoaded: (payments: PaymentRow[]) => void;
  onMappingReady: (mapping: ColumnMapping) => void;
};

const EMPTY_MAPPING: ColumnMapping = {
  payer: "",
  amount: "",
  date: "",
  reference: "",
};

export function ImportPayments({
  onPaymentsLoaded,
  onMappingReady,
}: ImportPaymentsProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [preview, setPreview] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mappingDone, setMappingDone] = useState(false);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    setMappingDone(false);
    setLoading(true);
    try {
      const h = await getHeadersFromFile(f);
      setHeaders(h);
      if (h.length > 0) {
        setMapping({
          payer: h.find((x) => /pagador|titular|payer/i.test(x)) ?? "",
          amount: h.find((x) => /monto|importe|amount/i.test(x)) ?? "",
          date: h.find((x) => /fecha|date/i.test(x)) ?? "",
          reference: h.find((x) => /referencia|ref|obs/i.test(x)) ?? "",
        });
      } else {
        setMapping(EMPTY_MAPPING);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al leer");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleApplyMapping = useCallback(async () => {
    if (!file || !mapping.payer || !mapping.amount || !mapping.date) return;
    setLoading(true);
    setError(null);
    try {
      const result = await parsePaymentsFile(file, mapping);
      setPayments(result.payments);
      setPreview(result.preview);
      setTotalRows(result.totalRows);
      if (result.error) {
        setError(result.error);
      } else {
        onPaymentsLoaded(result.payments);
        onMappingReady(mapping);
        setMappingDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al parsear");
    } finally {
      setLoading(false);
    }
  }, [file, mapping, onPaymentsLoaded, onMappingReady]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paso 2: Archivo de Pagos</CardTitle>
        <CardDescription>
          Subí el Excel/CSV con movimientos. Luego mapeá las columnas Pagador, Monto, Fecha y Referencia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
              disabled={loading}
            />
            <Button type="button" variant="outline" asChild>
              <span>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {file ? file.name : "Seleccionar archivo de pagos"}
              </span>
            </Button>
          </label>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {headers.length > 0 && (
          <>
            <ColumnMappingComponent
              headers={headers}
              mapping={mapping}
              onChange={setMapping}
            />
            <Button
              onClick={handleApplyMapping}
              disabled={loading || !mapping.payer || !mapping.amount || !mapping.date}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Aplicar mapeo y cargar pagos
            </Button>
          </>
        )}

        {mappingDone && payments.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">
              Cargados: {payments.length} pagos · Total filas: {totalRows}
            </p>
            <div className="overflow-x-auto rounded border max-h-32 overflow-y-auto">
              <table className="text-xs min-w-full">
                <tbody>
                  {preview.slice(0, 10).map((row, i) => (
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
