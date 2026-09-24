'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getAuth } from 'firebase/auth';
import { useUserProfile, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Receipt,
  Plus,
  Loader2,
  ExternalLink,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type {
  AccountingSummary,
  IncomeEntry,
  ClientAccountBalance,
  VendorAccountBalance,
} from '@/lib/accounting/types';

const MONTHS = [
  { value: 'all', label: 'Anual' },
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

const CATEGORY_LABELS: Record<string, string> = {
  cuotas: 'Cuotas mensuales',
  inscripcion: 'Inscripción',
  servicios: 'Servicios',
  ropa: 'Ropa',
  otros: 'Otros / manuales',
};

function formatMoney(n: number) {
  return `ARS ${n.toLocaleString('es-AR')}`;
}

export default function AccountingPage() {
  const { toast } = useToast();
  const { profile, activeSchoolId, isReady } = useUserProfile();
  const { user, loading: authLoading } = useUser();
  const schoolId = activeSchoolId || profile?.activeSchoolId || '';

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('resumen');
  const [ccSearch, setCcSearch] = useState('');
  const [clientBalances, setClientBalances] = useState<ClientAccountBalance[]>([]);
  const [vendorBalances, setVendorBalances] = useState<VendorAccountBalance[]>([]);
  const [loadingCc, setLoadingCc] = useState(false);
  const [ccError, setCcError] = useState<string | null>(null);
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [incomeForm, setIncomeForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    concept: '',
    category: 'Venta hielo',
  });

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const loadData = useCallback(async () => {
    if (!schoolId || !user) return;

    setLoading(true);
    setLoadError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ schoolId, year });
      if (month !== 'all') params.set('month', month);

      const [summaryRes, incomeRes] = await Promise.all([
        fetch(`/api/accounting/summary?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/accounting/income-entries?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      } else {
        const err = await summaryRes.json().catch(() => ({}));
        const msg = (err as { error?: string }).error ?? 'No se pudo cargar el resumen contable';
        setLoadError(msg);
        setSummary(null);
      }

      if (incomeRes.ok) {
        const data = await incomeRes.json();
        setIncomeEntries(data.entries ?? []);
      }
    } catch {
      setLoadError('Error de conexión al cargar contabilidad');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [schoolId, year, month, user]);

  useEffect(() => {
    if (schoolId && user) loadData();
  }, [schoolId, user, loadData]);

  const loadCuentasCorrientes = useCallback(async () => {
    if (!schoolId || !user) return;
    setLoadingCc(true);
    setCcError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ schoolId });
      if (ccSearch.trim()) params.set('q', ccSearch.trim());
      const res = await fetch(`/api/accounting/cuentas-corrientes?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Error al cargar cuentas corrientes');
      }
      const data = await res.json();
      setClientBalances(data.clientes ?? []);
      setVendorBalances(data.proveedores ?? []);
    } catch (e) {
      setCcError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoadingCc(false);
    }
  }, [schoolId, user, ccSearch]);

  useEffect(() => {
    if (schoolId && user && (activeTab === 'clientes' || activeTab === 'proveedores')) {
      const t = setTimeout(loadCuentasCorrientes, ccSearch ? 300 : 0);
      return () => clearTimeout(t);
    }
  }, [schoolId, user, activeTab, loadCuentasCorrientes, ccSearch]);

  const handleCreateIncome = async () => {
    const user = getAuth().currentUser;
    if (!user || !schoolId) return;
    const amount = parseFloat(incomeForm.amount);
    if (!amount || amount <= 0) {
      toast({ variant: 'destructive', title: 'Ingresá un monto válido' });
      return;
    }
    if (!incomeForm.concept.trim()) {
      toast({ variant: 'destructive', title: 'Ingresá un concepto' });
      return;
    }

    setSavingIncome(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/accounting/income-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          date: incomeForm.date,
          amount,
          currency: 'ARS',
          concept: incomeForm.concept.trim(),
          category: incomeForm.category.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al registrar ingreso');
      toast({ title: 'Ingreso registrado' });
      setIncomeDialogOpen(false);
      setIncomeForm({
        date: new Date().toISOString().slice(0, 10),
        amount: '',
        concept: '',
        category: 'Venta hielo',
      });
      await loadData();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error desconocido',
      });
    } finally {
      setSavingIncome(false);
    }
  };

  const periodLabel =
    month === 'all'
      ? `Año ${year}`
      : `${MONTHS.find((m) => m.value === month)?.label ?? month} ${year}`;

  if (!isReady || authLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!schoolId) {
    return (
      <p className="text-muted-foreground">Seleccioná una náutica para ver la contabilidad.</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-headline sm:text-3xl">Contabilidad</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ingresos, gastos y cuentas corrientes de clientes y proveedores
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTab === 'resumen' && (
            <>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => setIncomeDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Cargar ingreso
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="clientes">Cuentas clientes</TabsTrigger>
          <TabsTrigger value="proveedores">Cuentas proveedores</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-6 mt-4">
      {loadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {loadError}
          <Button variant="outline" size="sm" className="mt-3" onClick={() => loadData()}>
            Reintentar
          </Button>
        </div>
      )}

      {loading && !summary ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : summary ? (
        <>
          <p className="text-sm text-muted-foreground">Período: {periodLabel}</p>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Ingresos
                </CardDescription>
                <CardTitle className="text-2xl text-green-700 dark:text-green-400">
                  {formatMoney(summary.income.total)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {summary.income.count} cobros / ingresos registrados
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  Gastos
                </CardDescription>
                <CardTitle className="text-2xl text-red-700 dark:text-red-400">
                  {formatMoney(summary.expenses.total)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {summary.expenses.count} facturas confirmadas o pagadas
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Resultado
                </CardDescription>
                <CardTitle
                  className={`text-2xl ${
                    summary.result >= 0
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {formatMoney(summary.result)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Ingresos − gastos del período
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Desglose de ingresos</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(summary.income.byCategory)
                      .filter(([, v]) => v > 0)
                      .map(([key, value]) => (
                        <tr key={key} className="border-b last:border-0">
                          <td className="py-2 text-muted-foreground">
                            {CATEGORY_LABELS[key] ?? key}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {formatMoney(value)}
                          </td>
                        </tr>
                      ))}
                    {Object.values(summary.income.byCategory).every((v) => v === 0) && (
                      <tr>
                        <td colSpan={2} className="py-4 text-center text-muted-foreground">
                          Sin ingresos en este período
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/payments?schoolId=${schoolId}`}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Ver pagos
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cuentas corrientes</CardTitle>
                <CardDescription>Saldos acumulados (todas las fechas)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Clientes nos deben</p>
                      <p className="text-xs text-muted-foreground">
                        {summary.cuentaCorriente.clientes.movimientos} movimientos
                      </p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                    {formatMoney(summary.cuentaCorriente.clientes.saldoTotal)}
                  </p>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Debemos a proveedores</p>
                      <p className="text-xs text-muted-foreground">
                        {summary.cuentaCorriente.proveedores.movimientos} movimientos
                      </p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                    {formatMoney(summary.cuentaCorriente.proveedores.saldoTotal)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('clientes')}>
                    Ver cuentas clientes
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/expenses/vendors?schoolId=${schoolId}`}>
                      Ver proveedores
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {incomeEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ingresos manuales del período</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="p-2 text-left font-medium">Fecha</th>
                        <th className="p-2 text-left font-medium">Concepto</th>
                        <th className="p-2 text-left font-medium">Categoría</th>
                        <th className="p-2 text-right font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomeEntries.map((e) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="p-2">
                            {format(new Date(e.date), 'dd/MM/yyyy', { locale: es })}
                          </td>
                          <td className="p-2">{e.concept}</td>
                          <td className="p-2 text-muted-foreground">{e.category ?? '—'}</td>
                          <td className="p-2 text-right font-medium">
                            {formatMoney(e.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/expenses?schoolId=${schoolId}`}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Ver gastos del período
              </Link>
            </Button>
          </div>
        </>
      ) : !loading && !loadError ? (
        <p className="text-muted-foreground text-sm">No hay datos para mostrar en este período.</p>
      ) : null}
        </TabsContent>

        <TabsContent value="clientes" className="space-y-4 mt-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={ccSearch}
              onChange={(e) => setCcSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {ccError && (
            <p className="text-sm text-destructive">{ccError}</p>
          )}
          {loadingCc ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Cliente</th>
                    <th className="p-3 text-right font-medium">Saldo</th>
                    <th className="p-3 text-right font-medium">Movimientos</th>
                    <th className="p-3 text-left font-medium">Estado</th>
                    <th className="p-3 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {clientBalances.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        No hay clientes para mostrar
                      </td>
                    </tr>
                  ) : (
                    clientBalances.map((c) => (
                      <tr key={c.playerId} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{c.name}</td>
                        <td className={`p-3 text-right font-medium ${c.balance > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                          {formatMoney(c.balance)}
                        </td>
                        <td className="p-3 text-right text-muted-foreground">{c.movimientos}</td>
                        <td className="p-3">
                          {c.creditoActivo ? (
                            <Badge variant="secondary">Cta. cte. activa</Badge>
                          ) : (
                            <Badge variant="outline">Desactivada</Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/players/${c.playerId}/account?schoolId=${schoolId}`}>
                              Ver cuenta
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="proveedores" className="space-y-4 mt-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar proveedor..."
              value={ccSearch}
              onChange={(e) => setCcSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {ccError && (
            <p className="text-sm text-destructive">{ccError}</p>
          )}
          {loadingCc ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Proveedor</th>
                    <th className="p-3 text-right font-medium">Saldo</th>
                    <th className="p-3 text-right font-medium">Movimientos</th>
                    <th className="p-3 text-left font-medium">Cta. cte.</th>
                    <th className="p-3 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {vendorBalances.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        No hay proveedores. Cargalos desde Gastos → Proveedores.
                      </td>
                    </tr>
                  ) : (
                    vendorBalances.map((v) => (
                      <tr key={v.vendorId} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{v.name}</td>
                        <td className={`p-3 text-right font-medium ${v.balance > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                          {formatMoney(v.balance)}
                        </td>
                        <td className="p-3 text-right text-muted-foreground">{v.movimientos}</td>
                        <td className="p-3">
                          {v.cuentaCorrienteHabilitada ? (
                            <Badge variant="secondary">Habilitada</Badge>
                          ) : (
                            <Badge variant="outline">Deshabilitada</Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/expenses/vendor/${v.vendorId}?schoolId=${schoolId}`}>
                              Ver cuenta
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={incomeDialogOpen} onOpenChange={setIncomeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cargar ingreso manual</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={incomeForm.date}
                onChange={(e) => setIncomeForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Monto (ARS)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={incomeForm.amount}
                onChange={(e) => setIncomeForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Concepto</Label>
              <Input
                value={incomeForm.concept}
                onChange={(e) => setIncomeForm((f) => ({ ...f, concept: e.target.value }))}
                placeholder="Ej: Venta hielo"
              />
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select
                value={incomeForm.category}
                onValueChange={(v) => setIncomeForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Venta hielo">Venta hielo</SelectItem>
                  <SelectItem value="Otros">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncomeDialogOpen(false)} disabled={savingIncome}>
              Cancelar
            </Button>
            <Button onClick={handleCreateIncome} disabled={savingIncome}>
              {savingIncome ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
