'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Loader2, FileText, Banknote, ExternalLink, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { VendorPaymentDialog } from '@/components/expenses/VendorPaymentDialog';
import type { VendorAccountEntry } from '@/lib/expenses/types';
import type { ExpenseVendor } from '@/lib/expenses/types';

const ENTRY_TYPE_LABELS: Record<string, string> = {
  invoice: 'Factura',
  payment: 'Pago',
  credit_note: 'Nota de crédito',
  debit_note: 'Nota de débito',
  adjustment: 'Ajuste',
};

function VerComprobanteLink({
  storagePath,
  schoolId,
  receiptType,
}: {
  storagePath: string;
  schoolId: string;
  receiptType?: string;
}) {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    const user = getAuth().currentUser;
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/expenses/payment-receipt-url?storagePath=${encodeURIComponent(storagePath)}&schoolId=${encodeURIComponent(schoolId)}`,
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
  const label =
    receiptType === 'cheque'
      ? 'Ver cheque'
      : receiptType === 'transfer'
        ? 'Ver transferencia'
        : receiptType === 'credit_card'
          ? 'Ver cupón'
          : 'Ver comprobante';
  return (
    <Button
      variant="link"
      size="sm"
      className="h-auto p-0 text-primary inline-flex items-center gap-1"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <ExternalLink className="h-3 w-3" />
      )}
      {label}
    </Button>
  );
}

const IVA_CONDITIONS = [
  'IVA Responsable Inscripto',
  'IVA Responsable no Inscripto',
  'IVA Exento',
  'Consumidor Final',
  'Monotributista',
] as const;

type VendorForm = Partial<Pick<
  ExpenseVendor,
  'name' | 'cuit' | 'ivaCondition' | 'phone' | 'email' | 'address' | 'cuentaCorrienteHabilitada' | 'notes'
>>;

export default function VendorAccountPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const vendorId = params.vendorId as string;
  const schoolId = searchParams.get('schoolId') ?? '';
  const { toast } = useToast();

  const [entries, setEntries] = useState<VendorAccountEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [vendor, setVendor] = useState<VendorForm | null>(null);
  const [fromExpenseVendors, setFromExpenseVendors] = useState(false);
  const [fromExpenses, setFromExpenses] = useState(false);
  const [form, setForm] = useState<VendorForm>({});
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  const loadAccount = useCallback(async () => {
    if (!schoolId || !vendorId) return;
    const user = getAuth().currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/expenses/vendor-accounts/${vendorId}?schoolId=${schoolId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries ?? []);
      setBalance(data.balance ?? 0);
    }
  }, [schoolId, vendorId]);

  // Cargar proveedor y cuenta corriente
  useEffect(() => {
    if (!schoolId || !vendorId) return;
    const user = getAuth().currentUser;
    if (!user) return;

    const load = async () => {
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const [vendorRes, accountRes] = await Promise.all([
          fetch(`/api/expenses/vendors/${vendorId}?schoolId=${schoolId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/expenses/vendor-accounts/${vendorId}?schoolId=${schoolId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (vendorRes.ok) {
          const vendorData = await vendorRes.json();
          const v = vendorData.vendor ?? {};
          setVendor(v);
          setForm({
            name: v.name ?? '',
            cuit: v.cuit ?? '',
            ivaCondition: v.ivaCondition ?? '',
            phone: v.phone ?? '',
            email: v.email ?? '',
            address: v.address ?? '',
            cuentaCorrienteHabilitada: v.cuentaCorrienteHabilitada ?? true,
            notes: v.notes ?? '',
          });
          setFromExpenseVendors(vendorData.fromExpenseVendors ?? false);
          setFromExpenses(vendorData.fromExpenses ?? false);
        }

        if (accountRes.ok) {
          const accountData = await accountRes.json();
          setEntries(accountData.entries ?? []);
          setBalance(accountData.balance ?? 0);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [schoolId, vendorId]);

  const handleSave = async () => {
    const user = getAuth().currentUser;
    if (!user || !schoolId || !vendorId) return;

    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/expenses/vendors/${vendorId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          name: form.name?.trim() || undefined,
          cuit: form.cuit?.trim() || undefined,
          ivaCondition: form.ivaCondition?.trim() || undefined,
          phone: form.phone?.trim() || undefined,
          email: form.email?.trim() || undefined,
          address: form.address?.trim() || undefined,
          cuentaCorrienteHabilitada: form.cuentaCorrienteHabilitada ?? true,
          notes: form.notes?.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Error al guardar');
      }

      toast({ title: 'Proveedor guardado correctamente' });
      setEditMode(false);
      setFromExpenseVendors(true);
      setVendor(form);
    } catch (e) {
      toast({
        title: 'Error al guardar',
        description: e instanceof Error ? e.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const displayName = form.name || vendor?.name || vendorId;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/expenses?schoolId=${schoolId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Proveedor</h1>
          <p className="text-muted-foreground">
            {displayName}
            {fromExpenses && !fromExpenseVendors && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <FileText className="h-3 w-3" />
                Datos cargados desde facturas
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Datos del proveedor - editables */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Datos del proveedor</h2>
          {!editMode ? (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
              Editar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditMode(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
          )}
        </div>

        {editMode ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Razón social</Label>
              <Input
                value={form.name ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nombre del proveedor"
              />
            </div>
            <div className="space-y-2">
              <Label>CUIT</Label>
              <Input
                value={form.cuit ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))}
                placeholder="XX-XXXXXXXX-X"
              />
            </div>
            <div className="space-y-2">
              <Label>Condición IVA</Label>
              <Select
                value={form.ivaCondition ?? ''}
                onValueChange={(v) => setForm((f) => ({ ...f, ivaCondition: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {IVA_CONDITIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input
                value={form.phone ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+54 11 1234-5678"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="proveedor@ejemplo.com"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Dirección</Label>
              <Input
                value={form.address ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Dirección fiscal o de contacto"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4 sm:col-span-2">
              <div>
                <Label>Cuenta corriente habilitada</Label>
                <p className="text-sm text-muted-foreground">
                  Si está activa, se registran facturas y pagos en la cuenta corriente.
                </p>
              </div>
              <Switch
                checked={form.cuentaCorrienteHabilitada ?? true}
                onCheckedChange={(v) => setForm((f) => ({ ...f, cuentaCorrienteHabilitada: v }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Notas</Label>
              <Input
                value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Notas internas"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Razón social:</span>{' '}
              {form.name || vendor?.name || '-'}
            </div>
            <div>
              <span className="text-muted-foreground">CUIT:</span> {form.cuit || vendor?.cuit || '-'}
            </div>
            <div>
              <span className="text-muted-foreground">Condición IVA:</span>{' '}
              {form.ivaCondition || vendor?.ivaCondition || '-'}
            </div>
            <div>
              <span className="text-muted-foreground">Teléfono:</span>{' '}
              {form.phone || vendor?.phone || '-'}
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span>{' '}
              {form.email || vendor?.email || '-'}
            </div>
            <div>
              <span className="text-muted-foreground">Dirección:</span>{' '}
              {form.address || vendor?.address || '-'}
            </div>
            <div>
              <span className="text-muted-foreground">Cuenta corriente:</span>{' '}
              {form.cuentaCorrienteHabilitada ?? vendor?.cuentaCorrienteHabilitada ?? true
                ? 'Habilitada'
                : 'Deshabilitada'}
            </div>
            {(form.notes || vendor?.notes) && (
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Notas:</span> {form.notes || vendor?.notes}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Saldo y cuenta corriente */}
      <div className="rounded-lg border p-4 bg-muted/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Saldo actual</p>
          <p className="text-2xl font-bold">ARS {balance.toLocaleString('es-AR')}</p>
        </div>
        <Button onClick={() => setPaymentDialogOpen(true)}>
          <Banknote className="h-4 w-4 mr-2" />
          Registrar pago
        </Button>
      </div>

      <VendorPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        schoolId={schoolId}
        vendorId={vendorId}
        title="Registrar pago"
        onSuccess={loadAccount}
      />

      {loading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : (
        <div className="rounded-md border">
          <h3 className="p-3 font-medium border-b bg-muted/50">Movimientos de cuenta corriente</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">Fecha</th>
                <th className="p-3 text-left font-medium">Tipo</th>
                <th className="p-3 text-left font-medium">Estado</th>
                <th className="p-3 text-left font-medium">Descripción</th>
                <th className="p-3 text-right font-medium">Debe</th>
                <th className="p-3 text-right font-medium">Haber</th>
                <th className="p-3 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No hay movimientos
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="border-b hover:bg-muted/30">
                    <td className="p-3">
                      {format(new Date(e.date), 'dd/MM/yyyy', { locale: es })}
                    </td>
                    <td className="p-3">{ENTRY_TYPE_LABELS[e.type] ?? e.type}</td>
                    <td className="p-3">
                      {e.type === 'payment' ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Pagado
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{e.description}</span>
                        {e.type === 'payment' && e.receiptStoragePath && (
                          <VerComprobanteLink
                            storagePath={e.receiptStoragePath}
                            schoolId={schoolId}
                            receiptType={e.receiptType}
                          />
                        )}
                      </div>
                    </td>
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
      )}
    </div>
  );
}
