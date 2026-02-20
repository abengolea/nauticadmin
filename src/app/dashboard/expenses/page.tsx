'use client';

import { useState, useCallback, useEffect } from 'react';
import { useUserProfile } from '@/firebase';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Receipt, Plus, List, TrendingUp, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Expense } from '@/lib/expenses/types';
import type { AIExtractedExpense } from '@/lib/expenses/schemas';

export default function ExpensesPage() {
  const { profile, activeSchoolId } = useUserProfile();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{
    expenseId: string;
    extracted: AIExtractedExpense | null;
    duplicateCandidates: string[];
  } | null>(null);

  const schoolId = activeSchoolId || profile?.activeSchoolId || '';

  const fetchExpenses = useCallback(async () => {
    if (!schoolId) return;
    const user = getAuth().currentUser;
    if (!user) return;

    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ schoolId });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/expenses?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setExpenses(data.expenses ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [schoolId, statusFilter]);

  useEffect(() => {
    if (schoolId) fetchExpenses();
  }, [schoolId, statusFilter, fetchExpenses]);

  const handleUploadComplete = (data: { expenseId: string; storagePath: string }) => {
    setConfirmData({
      expenseId: data.expenseId,
      extracted: null,
      duplicateCandidates: [],
    });
    setConfirmOpen(true);
  };

  const handleParseComplete = (parseResult: {
    extracted?: AIExtractedExpense;
    duplicateCandidates?: string[];
  }) => {
    if (confirmData && parseResult.extracted) {
      setConfirmData({
        ...confirmData,
        extracted: parseResult.extracted,
        duplicateCandidates: parseResult.duplicateCandidates ?? [],
      });
    }
  };

  const handleConfirmed = () => {
    setConfirmData(null);
    setConfirmOpen(false);
    fetchExpenses();
  };

  if (!schoolId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Seleccioná una náutica para ver los gastos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gastos</h1>
        <p className="text-muted-foreground">
          Cargá facturas sacando una foto, extraemos los datos con IA y llevamos la cuenta corriente.
        </p>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList>
          <TabsTrigger value="list">
            <List className="h-4 w-4 mr-2" />
            Listado
          </TabsTrigger>
          <TabsTrigger value="add">
            <Plus className="h-4 w-4 mr-2" />
            Cargar gasto
          </TabsTrigger>
          <TabsTrigger value="accounts">
            <TrendingUp className="h-4 w-4 mr-2" />
            Cuentas corrientes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <div className="flex gap-2 mb-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="paid">Pagado</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchExpenses}>
              Actualizar
            </Button>
          </div>

          {loading ? (
            <p className="text-muted-foreground">Cargando...</p>
          ) : expenses.length === 0 ? (
            <p className="text-muted-foreground">No hay gastos. Cargá uno desde la pestaña &quot;Cargar gasto&quot;.</p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Proveedor</th>
                    <th className="p-3 text-left font-medium">Factura</th>
                    <th className="p-3 text-right font-medium">Total</th>
                    <th className="p-3 text-left font-medium">Fecha</th>
                    <th className="p-3 text-left font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-muted/30">
                      <td className="p-3">{e.supplier?.name || '-'}</td>
                      <td className="p-3">
                        {e.invoice?.type} {e.invoice?.pos}-{e.invoice?.number}
                      </td>
                      <td className="p-3 text-right">
                        {e.amounts?.currency} {e.amounts?.total?.toLocaleString('es-AR')}
                      </td>
                      <td className="p-3">
                        {e.invoice?.issueDate
                          ? format(new Date(e.invoice.issueDate), 'dd/MM/yyyy', { locale: es })
                          : '-'}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            e.status === 'paid'
                              ? 'default'
                              : e.status === 'draft'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {e.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="add" className="mt-4">
          <div className="max-w-md">
            <ExpenseCapture
              schoolId={schoolId}
              onUploadComplete={handleUploadComplete}
              onParseComplete={handleParseComplete}
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
        onClose={() => {
          setConfirmOpen(false);
          setConfirmData(null);
        }}
        expenseId={confirmData?.expenseId ?? ''}
        schoolId={schoolId}
        extracted={confirmData?.extracted ?? null}
        duplicateCandidates={confirmData?.duplicateCandidates}
        onConfirmed={handleConfirmed}
      />
    </div>
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
