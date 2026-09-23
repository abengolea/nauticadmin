'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Loader2, RefreshCw, Plus } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import type { ClientAccountEntry } from '@/lib/client-accounts/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const ENTRY_TYPE_LABELS: Record<string, string> = {
  invoice: 'Factura / cargo',
  payment: 'Cobro',
  monthly_fee: 'Cuota mensual',
  credit_note: 'Nota de crédito',
  debit_note: 'Nota de débito',
  adjustment: 'Ajuste',
};

export default function ClientAccountPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const playerId = params.id as string;
  const schoolId = searchParams.get('schoolId') ?? '';
  const { toast } = useToast();

  const [entries, setEntries] = useState<ClientAccountEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [playerName, setPlayerName] = useState('');
  const [creditoActivo, setCreditoActivo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryForm, setEntryForm] = useState({
    type: 'debit_note' as 'credit_note' | 'debit_note' | 'monthly_fee' | 'adjustment',
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    description: '',
    period: '',
  });

  const loadAccount = useCallback(async () => {
    if (!schoolId || !playerId) return;
    const user = getAuth().currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/clients/accounts/${playerId}?schoolId=${schoolId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries ?? []);
      setBalance(data.balance ?? 0);
      setPlayerName(data.playerName ?? playerId);
      setCreditoActivo(data.creditoActivo !== false);
    }
  }, [schoolId, playerId]);

  useEffect(() => {
    if (!schoolId || !playerId) return;
    const user = getAuth().currentUser;
    if (!user) return;
    setLoading(true);
    loadAccount().finally(() => setLoading(false));
  }, [schoolId, playerId, loadAccount]);

  const handleSync = async () => {
    const user = getAuth().currentUser;
    if (!user || !schoolId) return;
    setSyncing(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/clients/accounts/${playerId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ schoolId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al sincronizar');
      toast({
        title: 'Sincronización completada',
        description: `Se procesaron ${data.synced ?? 0} pagos aprobados.`,
      });
      await loadAccount();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Error al sincronizar',
        description: e instanceof Error ? e.message : 'Error desconocido',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateEntry = async () => {
    const user = getAuth().currentUser;
    if (!user || !schoolId) return;
    const amount = parseFloat(entryForm.amount);
    if (!amount || amount <= 0) {
      toast({ variant: 'destructive', title: 'Ingresá un monto válido' });
      return;
    }
    if (!entryForm.description.trim()) {
      toast({ variant: 'destructive', title: 'Ingresá una descripción' });
      return;
    }

    setSavingEntry(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/clients/accounts/${playerId}/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          type: entryForm.type,
          date: entryForm.date,
          amount,
          description: entryForm.description.trim(),
          period: entryForm.period.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al crear movimiento');
      toast({ title: 'Movimiento registrado' });
      setEntryDialogOpen(false);
      setEntryForm({
        type: 'debit_note',
        date: new Date().toISOString().slice(0, 10),
        amount: '',
        description: '',
        period: '',
      });
      await loadAccount();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error desconocido',
      });
    } finally {
      setSavingEntry(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/players/${playerId}?schoolId=${schoolId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Cuenta corriente</h1>
          <p className="text-muted-foreground">{playerName}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Estado cuenta corriente</p>
            {creditoActivo ? (
              <Badge variant="secondary">Habilitada</Badge>
            ) : (
              <Badge variant="outline">Deshabilitada (crédito activo = No)</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground max-w-md">
            Debe = cargos al cliente · Haber = cobros recibidos · Saldo positivo = el cliente nos debe
          </p>
        </div>
      </div>

      <div className="rounded-lg border p-4 bg-muted/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Saldo actual</p>
          <p className={`text-2xl font-bold ${balance > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}>
            ARS {balance.toLocaleString('es-AR')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing || !creditoActivo}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sincronizar pagos
          </Button>
          <Button onClick={() => setEntryDialogOpen(true)} disabled={!creditoActivo}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo movimiento
          </Button>
        </div>
      </div>

      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar movimiento manual</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={entryForm.type}
                onValueChange={(v) =>
                  setEntryForm((f) => ({
                    ...f,
                    type: v as typeof entryForm.type,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly_fee">Cuota mensual (debe)</SelectItem>
                  <SelectItem value="debit_note">Nota de débito (debe)</SelectItem>
                  <SelectItem value="credit_note">Nota de crédito (haber)</SelectItem>
                  <SelectItem value="adjustment">Ajuste (debe)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={entryForm.date}
                onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Monto (ARS)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={entryForm.amount}
                onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={entryForm.description}
                onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ej: Cuota marzo 2025"
              />
            </div>
            <div className="space-y-2">
              <Label>Período (opcional)</Label>
              <Input
                value={entryForm.period}
                onChange={(e) => setEntryForm((f) => ({ ...f, period: e.target.value }))}
                placeholder="2025-03"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialogOpen(false)} disabled={savingEntry}>
              Cancelar
            </Button>
            <Button onClick={handleCreateEntry} disabled={savingEntry}>
              {savingEntry ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : (
        <div className="rounded-md border">
          <h3 className="p-3 font-medium border-b bg-muted/50">Movimientos de cuenta corriente</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">Fecha</th>
                  <th className="p-3 text-left font-medium">Tipo</th>
                  <th className="p-3 text-left font-medium">Descripción</th>
                  <th className="p-3 text-right font-medium">Debe</th>
                  <th className="p-3 text-right font-medium">Haber</th>
                  <th className="p-3 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      No hay movimientos. Usá &quot;Sincronizar pagos&quot; para importar cobros históricos.
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-muted/30">
                      <td className="p-3">
                        {format(new Date(e.date), 'dd/MM/yyyy', { locale: es })}
                      </td>
                      <td className="p-3">{ENTRY_TYPE_LABELS[e.type] ?? e.type}</td>
                      <td className="p-3">{e.description}</td>
                      <td className="p-3 text-right">
                        {e.debit > 0 ? e.debit.toLocaleString('es-AR') : '-'}
                      </td>
                      <td className="p-3 text-right">
                        {e.credit > 0 ? e.credit.toLocaleString('es-AR') : '-'}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {(e.balanceAfter ?? 0).toLocaleString('es-AR')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
