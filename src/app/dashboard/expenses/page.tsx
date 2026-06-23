'use client';

import { useState, useCallback, useEffect } from 'react';
import { useUserProfile } from '@/firebase';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpenseCapture } from '@/components/expenses/ExpenseCapture';
import { ExpenseConfirmDialog } from '@/components/expenses/ExpenseConfirmDialog';
import { VendorPaymentDialog } from '@/components/expenses/VendorPaymentDialog';
import { Pencil, Plus, List, TrendingUp, ExternalLink, Filter, Banknote, Trash2, Receipt, Wallet, Download, FileText, FileSpreadsheet, ChevronDown, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Expense } from '@/lib/expenses/types';
import type { AIExtractedExpense } from '@/lib/expenses/schemas';

export default function ExpensesPage() {
  const { toast } = useToast();
  const { profile, activeSchoolId } = useUserProfile();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [summary, setSummary] = useState<{ totalFacturas: number; totalPagos: number; saldoTotal: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{
    expenseId: string;
    extracted: AIExtractedExpense | null;
    storagePath?: string | null;
    duplicateCandidates: string[];
    mode: 'confirm' | 'edit';
    initialStatus?: string;
    onDialogClosed?: () => void;
  } | null>(null);

  const schoolId = activeSchoolId || profile?.activeSchoolId || '';

  const fetchExpenses = useCallback(async () => {
    if (!schoolId) return;
    const user = getAuth().currentUser;
    if (!user) return;

    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ schoolId, limit: '300' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const [expensesRes, summaryRes] = await Promise.all([
        fetch(`/api/expenses?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/expenses/summary?schoolId=${schoolId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (expensesRes.ok) {
        const data = await expensesRes.json();
        const list = data.expenses ?? [];
        setExpenses(showArchived ? list.filter((e: Expense) => e.archivedAt) : list.filter((e: Expense) => !e.archivedAt));
      }
      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        setSummary({
          totalFacturas: sumData.totalFacturas ?? 0,
          totalPagos: sumData.totalPagos ?? 0,
          saldoTotal: sumData.saldoTotal ?? 0,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [schoolId, statusFilter, showArchived]);

  useEffect(() => {
    if (schoolId) fetchExpenses();
  }, [schoolId, statusFilter, fetchExpenses]);

  const handleUploadComplete = (
    data: { expenseId: string; storagePath: string },
    options?: { onDialogClosed: () => void }
  ) => {
    setConfirmData({
      expenseId: data.expenseId,
      extracted: null,
      storagePath: data.storagePath,
      duplicateCandidates: [],
      mode: 'confirm',
      onDialogClosed: options?.onDialogClosed,
    });
    setConfirmOpen(true);
  };

  const handleEditExpense = (expense: Expense) => {
    setConfirmData({
      expenseId: expense.id,
      extracted: {
        concept: expense.notes,
        supplier: expense.supplier,
        invoice: expense.invoice,
        amounts: expense.amounts ?? { currency: 'ARS', total: 0 },
        items: expense.items,
      },
      storagePath: expense.source?.storagePath,
      duplicateCandidates: [],
      mode: 'edit',
      initialStatus: expense.status,
    });
    setConfirmOpen(true);
  };

  const handleParseComplete = (parseResult: {
    extracted?: AIExtractedExpense;
    duplicateCandidates?: string[];
  }) => {
    if (parseResult.extracted) {
      toast({
        title: 'Datos extraídos',
        description: 'La IA extrajo los datos de la factura. Revisá y confirmá.',
      });
      setConfirmData((prev) =>
        prev
          ? {
              ...prev,
              extracted: parseResult.extracted ?? null,
              duplicateCandidates: parseResult.duplicateCandidates ?? [],
              mode: prev.mode,
              onDialogClosed: prev.onDialogClosed,
              storagePath: prev.storagePath,
            }
          : prev
      );
    }
  };

  const handleParseError = () => {
    const onNext = confirmData?.onDialogClosed;
    setConfirmOpen(false);
    setConfirmData(null);
    onNext?.();
  };

  const handleConfirmed = () => {
    const onNext = confirmData?.onDialogClosed;
    setConfirmData(null);
    setConfirmOpen(false);
    fetchExpenses();
    onNext?.();
  };

  const handleDialogClose = () => {
    const onNext = confirmData?.onDialogClosed;
    setConfirmOpen(false);
    setConfirmData(null);
    onNext?.();
  };

  if (!schoolId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Seleccioná una náutica para ver los gastos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-headline">Gastos</h1>
          <p className="text-muted-foreground">
            Cargá facturas sacando una foto, extraemos los datos con IA y llevamos la cuenta corriente.
          </p>
        </div>
        <ExportIvaButton
          schoolId={schoolId}
          monthFilter={monthFilter}
          yearFilter={yearFilter}
        />
      </div>

      {summary && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total facturas</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">ARS {summary.totalFacturas.toLocaleString('es-AR')}</div>
              <p className="text-xs text-muted-foreground">Confirmadas + pagadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total pagos</CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">ARS {summary.totalPagos.toLocaleString('es-AR')}</div>
              <p className="text-xs text-muted-foreground">Pagados a proveedores</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saldo con proveedores</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.saldoTotal > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                ARS {summary.saldoTotal.toLocaleString('es-AR')}
              </div>
              <p className="text-xs text-muted-foreground">Deuda pendiente</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="list" className="w-full min-w-0">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full sm:inline-flex sm:w-auto">
          <TabsTrigger value="list">
            <List className="h-4 w-4 mr-2" />
            Listado
          </TabsTrigger>
          <TabsTrigger value="add">
            <Plus className="h-4 w-4 mr-2" />
            Cargar factura
          </TabsTrigger>
          <TabsTrigger value="accounts">
            <TrendingUp className="h-4 w-4 mr-2" />
            Cuentas corrientes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <ExpenseListFilters
            showArchived={showArchived}
            onShowArchivedChange={setShowArchived}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            monthFilter={monthFilter}
            onMonthChange={setMonthFilter}
            yearFilter={yearFilter}
            onYearChange={setYearFilter}
            supplierFilter={supplierFilter}
            onSupplierChange={setSupplierFilter}
            expenses={expenses}
            onRefresh={fetchExpenses}
          />

          {loading ? (
            <p className="text-muted-foreground">Cargando...</p>
          ) : expenses.length === 0 ? (
            <p className="text-muted-foreground">No hay gastos. Cargá uno desde la pestaña &quot;Cargar factura&quot;.</p>
          ) : (
            <ExpenseListTable
              expenses={expenses}
              monthFilter={monthFilter}
              yearFilter={yearFilter}
              supplierFilter={supplierFilter}
              schoolId={schoolId}
              showArchived={showArchived}
              onEdit={handleEditExpense}
              onRefresh={fetchExpenses}
              toast={toast}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              bulkUpdating={bulkUpdating}
              onBulkUpdatingChange={setBulkUpdating}
            />
          )}
        </TabsContent>

        <TabsContent value="add" className="mt-4">
          <div className="w-full max-w-md min-w-0">
            <ExpenseCapture
              schoolId={schoolId}
              onUploadComplete={handleUploadComplete}
              onParseComplete={handleParseComplete}
              onParseError={handleParseError}
            />
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="mt-4">
          <p className="text-muted-foreground mb-4">
            Seleccioná un proveedor para ver su cuenta corriente.
          </p>
          <VendorAccountsList schoolId={schoolId} />
        </TabsContent>
      </Tabs>

      <ExpenseConfirmDialog
        open={confirmOpen}
        onClose={handleDialogClose}
        expenseId={confirmData?.expenseId ?? ''}
        schoolId={schoolId}
        extracted={confirmData?.extracted ?? null}
        storagePath={confirmData?.storagePath}
        duplicateCandidates={confirmData?.duplicateCandidates}
        mode={confirmData?.mode ?? 'confirm'}
        initialStatus={confirmData?.initialStatus}
        onConfirmed={handleConfirmed}
      />
    </div>
  );
}

function ExportIvaButton({
  schoolId,
  monthFilter,
  yearFilter,
}: {
  schoolId: string;
  monthFilter: string;
  yearFilter: string;
}) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const fetchAndExport = async (format: 'txt' | 'excel') => {
    const user = getAuth().currentUser;
    if (!user) return;
    setExporting(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ schoolId });
      if (monthFilter !== 'all') params.set('month', monthFilter);
      if (yearFilter !== 'all') params.set('year', yearFilter);
      const res = await fetch(`/api/reports/iva?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Error al obtener datos');
      }
      const data = await res.json();
      const { ivaVentas, ivaCompras } = data;
      const suffix = `${yearFilter !== 'all' ? yearFilter : ''}${monthFilter !== 'all' ? `-${String(monthFilter).padStart(2, '0')}` : ''}`.replace(/^-/, '') || format(new Date(), 'yyyy-MM');

      if (format === 'txt') {
        const lines: string[] = [];
        lines.push('=== IVA VENTAS ===');
        lines.push('Fecha\tTipo\tPtoVta\tNúmero\tCUIT/DNI\tNombre\tNeto\tIVA\tTotal');
        for (const r of ivaVentas) {
          lines.push(`${r.fecha}\t${r.tipoCbte}\t${r.ptoVta}\t${r.numero}\t${r.cuitDni}\t${r.nombre}\t${r.neto.toFixed(2)}\t${r.iva.toFixed(2)}\t${r.total.toFixed(2)}`);
        }
        lines.push('');
        lines.push('=== IVA COMPRAS ===');
        lines.push('Fecha\tTipo\tPtoVta\tNúmero\tCUIT\tRazón Social\tNeto\tIVA\tTotal');
        for (const r of ivaCompras) {
          lines.push(`${r.fecha}\t${r.tipoCbte}\t${r.ptoVta}\t${r.numero}\t${r.cuit}\t${r.razonSocial}\t${r.neto.toFixed(2)}\t${r.iva.toFixed(2)}\t${r.total.toFixed(2)}`);
        }
        const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `iva-ventas-compras-${suffix}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const wb = XLSX.utils.book_new();
        const wsVentas = XLSX.utils.aoa_to_sheet([
          ['IVA VENTAS'],
          ['Fecha', 'Tipo', 'Pto Vta', 'Número', 'CUIT/DNI', 'Nombre', 'Neto', 'IVA', 'Total'],
          ...ivaVentas.map((r) => [r.fecha, r.tipoCbte, r.ptoVta, r.numero, r.cuitDni, r.nombre, r.neto, r.iva, r.total]),
        ]);
        const wsCompras = XLSX.utils.aoa_to_sheet([
          ['IVA COMPRAS'],
          ['Fecha', 'Tipo', 'Pto Vta', 'Número', 'CUIT', 'Razón Social', 'Neto', 'IVA', 'Total'],
          ...ivaCompras.map((r) => [r.fecha, r.tipoCbte, r.ptoVta, r.numero, r.cuit, r.razonSocial, r.neto, r.iva, r.total]),
        ]);
        XLSX.utils.book_append_sheet(wb, wsVentas, 'IVA Ventas');
        XLSX.utils.book_append_sheet(wb, wsCompras, 'IVA Compras');
        XLSX.writeFile(wb, `iva-ventas-compras-${suffix}.xlsx`);
      }
      toast({
        title: 'Exportado',
        description: `IVA ventas (${ivaVentas.length}) e IVA compras (${ivaCompras.length}) en ${format === 'txt' ? 'TXT' : 'Excel'}.`,
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Error al exportar',
        description: e instanceof Error ? e.message : 'No se pudo exportar',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Exportar IVA
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => fetchAndExport('txt')} disabled={exporting}>
          <FileText className="h-4 w-4 mr-2" />
          Exportar en TXT
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => fetchAndExport('excel')} disabled={exporting}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Exportar en Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const MONTHS = [
  { value: 'all', label: 'Todos los meses' },
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

function ExpenseListFilters({
  statusFilter,
  onStatusChange,
  monthFilter,
  onMonthChange,
  yearFilter,
  onYearChange,
  supplierFilter,
  onSupplierChange,
  showArchived,
  onShowArchivedChange,
  expenses,
  onRefresh,
}: {
  statusFilter: string;
  onStatusChange: (v: string) => void;
  monthFilter: string;
  onMonthChange: (v: string) => void;
  yearFilter: string;
  onYearChange: (v: string) => void;
  supplierFilter: string;
  onSupplierChange: (v: string) => void;
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
  expenses: Expense[];
  onRefresh: () => void;
}) {
  const suppliers = Array.from(
    new Map(
      expenses
        .filter((e) => e.supplier?.name?.trim())
        .map((e) => [e.supplier!.name!.trim(), e.supplier!.name!.trim()])
    ).entries()
  ).sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''));

  const years = Array.from(
    new Set(
      expenses
        .map((e) => e.invoice?.issueDate?.slice(0, 4))
        .filter(Boolean) as string[]
    )
  ).sort((a, b) => b.localeCompare(a));
  if (years.length === 0) years.push(new Date().getFullYear().toString());

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 min-w-0">
      <Filter className="h-4 w-4 text-muted-foreground" />
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="draft">Borrador</SelectItem>
          <SelectItem value="confirmed">Confirmada</SelectItem>
          <SelectItem value="paid">Pagada</SelectItem>
        </SelectContent>
      </Select>
      <Select value={monthFilter} onValueChange={onMonthChange}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Mes" />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={yearFilter} onValueChange={onYearChange}>
        <SelectTrigger className="w-28">
          <SelectValue placeholder="Año" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {years.map((y) => (
            <SelectItem key={y} value={y}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={supplierFilter} onValueChange={onSupplierChange}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Proveedor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {suppliers.map(([id, name]) => (
            <SelectItem key={id} value={name ?? id}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={onRefresh}>
        Actualizar
      </Button>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox
          checked={showArchived}
          onCheckedChange={(c) => onShowArchivedChange(!!c)}
        />
        Ver papelera
      </label>
    </div>
  );
}

function ExpenseListTable({
  expenses,
  monthFilter,
  yearFilter,
  supplierFilter,
  schoolId,
  showArchived,
  onEdit,
  onRefresh,
  toast,
  selectedIds,
  onSelectionChange,
  bulkUpdating,
  onBulkUpdatingChange,
}: {
  expenses: Expense[];
  monthFilter: string;
  yearFilter: string;
  supplierFilter: string;
  schoolId: string;
  showArchived: boolean;
  onEdit: (e: Expense) => void;
  onRefresh: () => void;
  toast: ReturnType<typeof useToast>['toast'];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  bulkUpdating: boolean;
  onBulkUpdatingChange: (v: boolean) => void;
}) {
  const filtered = expenses.filter((e) => {
    if (monthFilter !== 'all') {
      const m = e.invoice?.issueDate?.slice(5, 7);
      if (m !== monthFilter.padStart(2, '0')) return false;
    }
    if (yearFilter !== 'all') {
      const y = e.invoice?.issueDate?.slice(0, 4);
      if (y !== yearFilter) return false;
    }
    if (supplierFilter !== 'all') {
      if (e.supplier?.name?.trim() !== supplierFilter) return false;
    }
    return true;
  });

  const visibleIds = new Set(filtered.map((e) => e.id));
  const allSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));
  const someSelected = filtered.some((e) => selectedIds.has(e.id));
  const [paymentExpense, setPaymentExpense] = useState<Expense | null>(null);

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange(new Set([...selectedIds].filter((id) => !visibleIds.has(id))));
    } else {
      onSelectionChange(new Set([...selectedIds, ...filtered.map((e) => e.id)]));
    }
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectionChange(next);
  };

  const bulkUpdateStatus = async (newStatus: string) => {
    const ids = [...selectedIds].filter((id) => visibleIds.has(id));
    if (ids.length === 0) return;
    const user = getAuth().currentUser;
    if (!user) return;
    onBulkUpdatingChange(true);
    try {
      const token = await user.getIdToken();
      let ok = 0;
      for (const expenseId of ids) {
        const res = await fetch('/api/expenses', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ expenseId, schoolId, updates: { status: newStatus } }),
        });
        if (res.ok) ok++;
      }
      toast({
        title: 'Actualización masiva',
        description: `${ok} de ${ids.length} gastos actualizados a ${STATUS_LABELS[newStatus] ?? newStatus}.`,
      });
      onSelectionChange(new Set());
      onRefresh();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar' });
    } finally {
      onBulkUpdatingChange(false);
    }
  };

  const selectAllDrafts = () => {
    const draftIds = filtered.filter((e) => e.status === 'draft').map((e) => e.id);
    onSelectionChange(new Set(draftIds));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {filtered.some((e) => e.status === 'draft') && (
          <Button variant="outline" size="sm" onClick={selectAllDrafts}>
            Seleccionar todos los borradores
          </Button>
        )}
      </div>
      {someSelected && (
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-muted/50">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} seleccionado(s)
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkUpdateStatus('confirmed')}
            disabled={bulkUpdating}
          >
            Marcar como confirmada
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectionChange(new Set())}
          >
            Desmarcar
          </Button>
        </div>
      )}
      <div className="rounded-md border overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  disabled={filtered.length === 0}
                />
              </th>
              <th className="p-3 text-left font-medium">Proveedor</th>
              <th className="p-3 text-left font-medium">Concepto</th>
              <th className="p-3 text-left font-medium">Factura</th>
              <th className="p-3 text-right font-medium">Total</th>
              <th className="p-3 text-left font-medium">Fecha</th>
              <th className="p-3 text-left font-medium">Estado</th>
              <th className="p-3 w-24 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                schoolId={schoolId}
                showArchived={showArchived}
                onEdit={onEdit}
                onArchive={onRefresh}
                onStatusChange={onRefresh}
                onOpenPayment={setPaymentExpense}
                toast={toast}
                selected={selectedIds.has(e.id)}
                onSelectionChange={(checked) => toggleOne(e.id, checked)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {paymentExpense && (
        <VendorPaymentDialog
          open={!!paymentExpense}
          onOpenChange={(open) => !open && setPaymentExpense(null)}
          schoolId={schoolId}
          vendorId={getVendorId(paymentExpense) || `temp-${paymentExpense.id}`}
          expenseId={paymentExpense.id}
          suggestedAmount={paymentExpense.amounts?.total}
          onSuccess={onRefresh}
          title="Registrar pago"
        />
      )}
    </div>
  );
}

function VerFacturaButton({ expenseId, schoolId }: { expenseId: string; schoolId: string }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    const user = getAuth().currentUser;
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/expenses/${expenseId}/invoice-url?schoolId=${encodeURIComponent(schoolId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.url) window.open(data.url, '_blank');
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={handleClick}
      disabled={loading}
      title="Ver factura"
    >
      <ExternalLink className="h-4 w-4" />
    </Button>
  );
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  paid: 'Pagada',
};

function getVendorId(expense: Expense): string {
  return (
    expense.supplier?.vendorId ||
    expense.supplier?.cuit?.replace(/\D/g, '') ||
    expense.supplier?.name ||
    ''
  );
}

function ExpenseRow({
  expense,
  schoolId,
  showArchived,
  onEdit,
  onArchive,
  onStatusChange,
  onOpenPayment,
  toast,
  selected,
  onSelectionChange,
}: {
  expense: Expense;
  schoolId: string;
  showArchived: boolean;
  onEdit: (e: Expense) => void;
  onArchive: () => void;
  onStatusChange: () => void;
  onOpenPayment: (expense: Expense) => void;
  toast: ReturnType<typeof useToast>['toast'];
  selected?: boolean;
  onSelectionChange?: (checked: boolean) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const vendorId = getVendorId(expense);

  const updateStatus = async (newStatus: string) => {
    const user = getAuth().currentUser;
    if (!user) return;
    setUpdating(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/expenses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          expenseId: expense.id,
          schoolId,
          updates: { status: newStatus },
        }),
      });
      if (res.ok) {
        toast({ title: 'Estado actualizado', description: `Factura marcada como ${STATUS_LABELS[newStatus] ?? newStatus}.` });
        onStatusChange();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'Error', description: data.error ?? 'No se pudo actualizar' });
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleArchive = async () => {
    const user = getAuth().currentUser;
    if (!user) return;
    setArchiving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/expenses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          expenseId: expense.id,
          schoolId,
          updates: { archivedAt: new Date().toISOString() },
        }),
      });
      if (res.ok) {
        toast({ title: 'Movido a papelera' });
        onArchive();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'Error', description: data.error ?? 'No se pudo mover' });
      }
    } finally {
      setArchiving(false);
    }
  };

  const handleRestore = async () => {
    const user = getAuth().currentUser;
    if (!user) return;
    setArchiving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/expenses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          expenseId: expense.id,
          schoolId,
          updates: { archivedAt: null },
        }),
      });
      if (res.ok) {
        toast({ title: 'Restaurado' });
        onArchive();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'Error', description: data.error ?? 'No se pudo restaurar' });
      }
    } finally {
      setArchiving(false);
    }
  };

  const displayStatus = expense.status === 'cancelled' ? 'confirmed' : expense.status;

  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="p-3 w-10">
        {onSelectionChange && (
          <Checkbox
            checked={selected}
            onCheckedChange={(c) => onSelectionChange(!!c)}
          />
        )}
      </td>
      <td className="p-3">{expense.supplier?.name || '-'}</td>
      <td className="p-3 max-w-[180px] truncate" title={expense.notes ?? undefined}>
        {expense.notes || '-'}
      </td>
      <td className="p-3">
        {expense.invoice?.type} {expense.invoice?.pos}-{expense.invoice?.number}
      </td>
      <td className="p-3 text-right">
        {expense.amounts?.currency} {expense.amounts?.total?.toLocaleString('es-AR')}
      </td>
      <td className="p-3">
        {expense.invoice?.issueDate
          ? format(new Date(expense.invoice.issueDate), 'dd/MM/yyyy', { locale: es })
          : '-'}
      </td>
      <td className="p-3">
        {!showArchived ? (
          <Select
            value={displayStatus}
            onValueChange={updateStatus}
            disabled={updating}
          >
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">{STATUS_LABELS.draft}</SelectItem>
            <SelectItem value="confirmed">{STATUS_LABELS.confirmed}</SelectItem>
            <SelectItem value="paid">{STATUS_LABELS.paid}</SelectItem>
          </SelectContent>
          </Select>
        ) : (
          <span className="text-muted-foreground">En papelera</span>
        )}
      </td>
      <td className="p-3 text-right">
        {expense.source?.storagePath && (
          <VerFacturaButton expenseId={expense.id} schoolId={schoolId} />
        )}
        {!showArchived && vendorId && expense.status !== 'paid' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onOpenPayment(expense)}
            title="Pagar factura"
          >
            <Banknote className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(expense)}
          title="Editar"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={showArchived ? handleRestore : handleArchive}
          disabled={archiving}
          title={showArchived ? 'Restaurar' : 'Mover a papelera'}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

function VendorAccountsList({ schoolId }: { schoolId: string }) {
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);

  // Por ahora extraemos proveedores únicos de los gastos
  const loadVendors = async () => {
    const user = getAuth().currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/expenses?schoolId=${schoolId}&limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const seen = new Map<string, string>();
    for (const e of data.expenses ?? []) {
      const vid = e.supplier?.vendorId || e.supplier?.cuit?.replace(/\D/g, '') || e.supplier?.name;
      if (vid && !seen.has(vid)) {
        seen.set(vid, e.supplier?.name || vid);
      }
    }
    setVendors(Array.from(seen.entries()).map(([id, name]) => ({ id, name })));
  };

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={loadVendors}>
        Cargar proveedores
      </Button>
      {vendors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {vendors.map((v) => (
            <Button
              key={v.id}
              variant="outline"
              size="sm"
              asChild
            >
              <a href={`/dashboard/expenses/vendor/${v.id}?schoolId=${schoolId}`}>
                {v.name}
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
