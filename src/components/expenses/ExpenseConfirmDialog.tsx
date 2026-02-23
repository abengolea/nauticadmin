'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { getAuth } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { ExternalLink } from 'lucide-react';
import type { AIExtractedExpense } from '@/lib/expenses/schemas';

interface ExpenseConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  expenseId: string;
  schoolId: string;
  extracted: AIExtractedExpense | null;
  storagePath?: string | null;
  duplicateCandidates?: string[];
  mode?: 'confirm' | 'edit';
  initialStatus?: string;
  onConfirmed: () => void;
}

export function ExpenseConfirmDialog({
  open,
  onClose,
  expenseId,
  schoolId,
  extracted,
  storagePath,
  duplicateCandidates = [],
  mode = 'confirm',
  initialStatus,
  onConfirmed,
}: ExpenseConfirmDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<AIExtractedExpense | null>(extracted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  useEffect(() => {
    setForm(extracted);
  }, [extracted]);

  useEffect(() => {
    if (!open || !storagePath || !schoolId || !expenseId) {
      setInvoiceUrl(null);
      return;
    }
    let cancelled = false;
    const fetchUrl = async () => {
      const user = getAuth().currentUser;
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/expenses/${expenseId}/invoice-url?schoolId=${encodeURIComponent(schoolId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setInvoiceUrl(data.url ?? null);
        } else {
          setInvoiceUrl(null);
        }
      } catch {
        if (!cancelled) setInvoiceUrl(null);
      }
    };
    fetchUrl();
    return () => {
      cancelled = true;
    };
  }, [open, storagePath, schoolId, expenseId]);

  const handleConfirm = async () => {
    if (!form) return;
    const user = getAuth().currentUser;
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/expenses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          expenseId,
          schoolId,
          updates: {
            supplier: form.supplier,
            invoice: form.invoice,
            amounts: form.amounts,
            items: form.items,
            notes: form.concept?.trim() || undefined,
            ...(mode === 'edit' && initialStatus && { status: initialStatus }),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al confirmar');
      }
      toast({
        title: mode === 'edit' ? 'Gasto actualizado' : 'Gasto registrado',
        description: 'La factura se guardó correctamente.',
      });
      onConfirmed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Editar gasto' : 'Confirmar datos extraídos'}</DialogTitle>
        </DialogHeader>

        {!form ? (
          <p className="py-8 text-center text-muted-foreground">
            Extrayendo datos con IA...
          </p>
        ) : (
        <>
        {duplicateCandidates.length > 0 && (
          <div className="rounded-md bg-amber-500/20 p-3 text-sm text-amber-800 dark:text-amber-200">
            Posible duplicado: existen facturas similares. Revisá antes de confirmar.
          </div>
        )}

        <div className="grid gap-4 py-4">
          {invoiceUrl && (
            <div className="flex items-center gap-2">
              <a
                href={invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Ver factura (foto/PDF)
              </a>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Concepto</Label>
            <Input
              value={form.concept ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  concept: e.target.value,
                })
              }
              placeholder="Descripción del gasto"
            />
          </div>
          <div className="grid gap-2">
            <Label>Proveedor</Label>
            <Input
              value={form.supplier?.name ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  supplier: { ...form.supplier, name: e.target.value },
                })
              }
              placeholder="Razón social"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label>CUIT</Label>
              <Input
                value={form.supplier?.cuit ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    supplier: { ...form.supplier, cuit: e.target.value },
                  })
                }
                placeholder="XX-XXXXXXXX-X"
              />
            </div>
            <div className="grid gap-2">
              <Label>Fecha</Label>
              <Input
                value={form.invoice?.issueDate ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    invoice: { ...form.invoice, issueDate: e.target.value },
                  })
                }
                placeholder="YYYY-MM-DD"
              />
            </div>
          </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Punto de venta</Label>
                <Input
                  value={form.invoice?.pos ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      invoice: { ...form.invoice, pos: e.target.value },
                    })
                  }
                  placeholder="0001"
                />
              </div>
              <div className="grid gap-2">
                <Label>Número</Label>
                <Input
                  value={form.invoice?.number ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      invoice: { ...form.invoice, number: e.target.value },
                    })
                  }
                  placeholder="00001234"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Moneda</Label>
                <Select
                  value={form.amounts?.currency ?? 'ARS'}
                  onValueChange={(v: 'ARS' | 'USD') =>
                    setForm({
                      ...form,
                      amounts: {
                        ...form.amounts,
                        currency: v,
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS (Pesos)</SelectItem>
                    <SelectItem value="USD">USD (Dólares)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Total</Label>
                <Input
                  type="number"
                  value={form.amounts?.total ?? 0}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      amounts: {
                        ...form.amounts,
                        total: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                />
              </div>
            </div>
        </div>
        </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!form || loading}>
            {loading ? 'Guardando...' : mode === 'edit' ? 'Guardar cambios' : 'Confirmar gasto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
