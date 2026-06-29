'use client';

import { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, FileSpreadsheet, ChevronDown, CheckCircle2 } from 'lucide-react';
import {
  detectVendorColumnMapping,
  findVendorHeaderRow,
  parseVendorImportRows,
  type VendorColumnMapping,
} from '@/lib/expenses/vendor-import';

type ImportResult = {
  created: number;
  updated: number;
  total: number;
  message: string;
};

function resetImportForm(setters: {
  setFile: (f: File | null) => void;
  setHeaders: (h: string[]) => void;
  setPreviewCount: (n: number) => void;
  setColumns: (c: VendorColumnMapping | null) => void;
  setParsedVendors: (v: never[]) => void;
}) {
  setters.setFile(null);
  setters.setHeaders([]);
  setters.setPreviewCount(0);
  setters.setColumns(null);
  setters.setParsedVendors([]);
}

export function ImportVendorsFromExcel({
  schoolId,
  catalogCount = 0,
  onImported,
}: {
  schoolId: string;
  catalogCount?: number;
  onImported?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(catalogCount === 0);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [columns, setColumns] = useState<VendorColumnMapping | null>(null);
  const [parsedVendors, setParsedVendors] = useState<
    Array<{
      vendorId: string;
      name: string;
      cuit?: string;
      address?: string;
      ivaCondition?: string;
      cuentaCorrienteHabilitada?: boolean;
      externalCode?: string;
      creditDays?: number;
    }>
  >([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (catalogCount > 0 && !file && !columns) {
      setOpen(false);
    }
  }, [catalogCount, file, columns]);

  const parseExcel = useCallback((f: File): Promise<(string | number)[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            reject(new Error('No se pudo leer el archivo'));
            return;
          }
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<(string | number)[]>(firstSheet, {
            header: 1,
            defval: '',
            raw: false,
          }) as (string | number)[][];
          if (json.length === 0) {
            reject(new Error('El archivo está vacío'));
            return;
          }
          resolve(json);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsBinaryString(f);
    });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(ext ?? '')) {
      toast({
        variant: 'destructive',
        title: 'Formato no válido',
        description: 'Solo se aceptan archivos Excel (.xlsx, .xls).',
      });
      return;
    }
    setOpen(true);
    setFile(f);
    setHeaders([]);
    setColumns(null);
    setParsedVendors([]);
    setPreviewCount(0);
    setResult(null);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const json = await parseExcel(file);
      const headerRowIndex = findVendorHeaderRow(json);
      const headerRow = (json[headerRowIndex] ?? []).map((c) => String(c ?? '').trim());
      const mapping = detectVendorColumnMapping(headerRow);
      const vendors = parseVendorImportRows(json, mapping, headerRowIndex);

      if (vendors.length === 0) {
        throw new Error(
          'No se encontraron proveedores. Verificá que el Excel tenga columnas Código, Razón Social y CUIT.'
        );
      }

      setHeaders(headerRow.length > 0 ? headerRow : ['Col A', 'Col B', 'Col C']);
      setColumns(mapping);
      setPreviewCount(vendors.length);
      setParsedVendors(
        vendors.map((v) => ({
          vendorId: v.vendorId,
          name: v.name,
          cuit: v.cuit,
          address: v.address,
          ivaCondition: v.ivaCondition,
          cuentaCorrienteHabilitada: v.cuentaCorrienteHabilitada,
          externalCode: v.externalCode,
          creditDays: v.creditDays,
        }))
      );

      toast({
        title: 'Archivo analizado',
        description: `${vendors.length} proveedores detectados. Revisá el mapeo y confirmá la importación.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error al leer',
        description: err instanceof Error ? err.message : 'Error desconocido',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    if (!file || !columns) return;
    const user = getAuth().currentUser;
    if (!user) return;

    setImporting(true);
    setResult(null);
    try {
      const json = await parseExcel(file);
      const headerRowIndex = findVendorHeaderRow(json);
      const vendors = parseVendorImportRows(json, columns, headerRowIndex).map((v) => ({
        vendorId: v.vendorId,
        name: v.name,
        cuit: v.cuit,
        address: v.address,
        ivaCondition: v.ivaCondition,
        cuentaCorrienteHabilitada: v.cuentaCorrienteHabilitada,
        externalCode: v.externalCode,
        creditDays: v.creditDays,
      }));

      if (vendors.length === 0) {
        throw new Error('No se encontraron proveedores con el mapeo actual.');
      }

      const token = await user.getIdToken();
      const res = await fetch('/api/expenses/vendors/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ schoolId, vendors }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al importar proveedores');
      }

      const importResult = {
        created: data.created ?? 0,
        updated: data.updated ?? 0,
        total: data.total ?? vendors.length,
        message: data.message ?? 'Importación completada',
      };
      setResult(importResult);
      resetImportForm({ setFile, setHeaders, setPreviewCount, setColumns, setParsedVendors });
      setOpen(false);
      toast({ title: 'Proveedores importados', description: data.message });
      onImported?.();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error al importar',
        description: err instanceof Error ? err.message : 'Error desconocido',
      });
    } finally {
      setImporting(false);
    }
  };

  const columnLabels: { key: keyof VendorColumnMapping; label: string }[] = [
    { key: 'colCode', label: 'Código' },
    { key: 'colName', label: 'Razón social' },
    { key: 'colAddress', label: 'Dirección' },
    { key: 'colCity', label: 'Localidad' },
    { key: 'colProvince', label: 'Provincia' },
    { key: 'colPostalCode', label: 'C.P.' },
    { key: 'colIvaType', label: 'Tipo IVA' },
    { key: 'colDocType', label: 'Tipo doc.' },
    { key: 'colCuit', label: 'CUIT/Documento' },
    { key: 'colCreditActive', label: 'Crédito activo' },
    { key: 'colCreditDays', label: 'Días crédito' },
  ];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="shrink-0">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-muted/40 transition-colors rounded-t-lg"
          >
            <div className="flex items-start gap-2 min-w-0">
              <FileSpreadsheet className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground" />
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold">
                  Importar proveedores desde Excel
                </CardTitle>
                {!open && (
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                    {result
                      ? `${result.message} · Catálogo: ${catalogCount} proveedores`
                      : catalogCount > 0
                        ? `${catalogCount} proveedores en el catálogo · Expandir para importar otro Excel`
                        : 'Expandir para subir un listado contable'}
                  </p>
                )}
              </div>
            </div>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4 border-t">
            <CardDescription className="pt-4">
              Subí el listado de proveedores de tu sistema contable (ej. Marinas del Yaguaron).
              Detectamos automáticamente las columnas Código, Razón Social, CUIT, dirección e IVA.
            </CardDescription>

            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <input
                id="vendors-excel-upload"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                variant="outline"
                type="button"
                onClick={() => document.getElementById('vendors-excel-upload')?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Elegir archivo Excel
              </Button>
              {file && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground truncate max-w-[240px]">
                    {file.name}
                  </span>
                  <Button size="sm" variant="secondary" onClick={handleAnalyze} disabled={importing}>
                    {importing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analizando…
                      </>
                    ) : (
                      'Analizar archivo'
                    )}
                  </Button>
                </div>
              )}
            </div>

            {columns && previewCount > 0 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {previewCount} proveedores listos para importar.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {columnLabels.map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                      <select
                        value={columns[key]}
                        onChange={(e) =>
                          setColumns((c) => c && { ...c, [key]: Number(e.target.value) })
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
                  ))}
                </div>
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importando…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Importar {previewCount} proveedores
                    </>
                  )}
                </Button>
              </div>
            )}

            {result && (
              <div className="text-sm p-3 rounded-md bg-green-500/10 border border-green-500/20 space-y-1 flex gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">{result.message}</p>
                  <p className="text-muted-foreground">
                    Nuevos: {result.created} · Actualizados: {result.updated} · Total: {result.total}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
