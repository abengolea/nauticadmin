'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ChequeCobroPendiente } from '@/app/api/payments/cheques-pendientes/route';

interface ChequesCobrosPendientesAlertProps {
  schoolId: string;
  getToken: () => Promise<string | null>;
  onUpdated?: () => void;
}

/** Formatea período para mostrar (inscripcion, FEBRERO-2026, etc.) */
function formatPeriod(period: string): string {
  if (period === 'inscripcion') return 'Inscripción';
  const ropaMatch = period.match(/^ropa-(\d+)$/);
  if (ropaMatch) return `Ropa (${ropaMatch[1]})`;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    const [y, m] = period.split('-');
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return format(date, 'MMMM yyyy', { locale: es });
  }
  return period;
}

export function ChequesCobrosPendientesAlert({ schoolId, getToken, onUpdated }: ChequesCobrosPendientesAlertProps) {
  const [cheques, setCheques] = useState<ChequeCobroPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/payments/cheques-pendientes?schoolId=${schoolId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCheques(data.cheques ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [schoolId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdateStatus = async (paymentId: string, chequeStatus: 'cheque_cobrado' | 'cheque_rechazado') => {
    const token = await getToken();
    if (!token || !schoolId) return;
    setUpdating(paymentId);
    try {
      const res = await fetch(`/api/payments/${paymentId}/cheque-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ schoolId, chequeStatus }),
      });
      if (res.ok) {
        setCheques((prev) => prev.filter((c) => c.paymentId !== paymentId));
        onUpdated?.();
      } else {
        const err = await res.json();
        throw new Error(err.error ?? 'Error al actualizar');
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Error al actualizar estado');
    } finally {
      setUpdating(null);
    }
  };

  if (loading || cheques.length === 0) return null;

  const vencidos = cheques.filter((c) => c.isVencido);

  return (
    <Alert
      variant={vencidos.length > 0 ? 'destructive' : 'default'}
      className="mb-4 border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500/30"
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between gap-2">
        <span>
          Cheques recibidos pendientes de cobrar ({cheques.length})
          {vencidos.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {vencidos.length} vencidos
            </Badge>
          )}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </AlertTitle>
      <AlertDescription>
        {vencidos.length > 0 && (
          <p className="mb-2 text-sm">
            Hay cheques vencidos. Verificá si se cobraron en el banco y actualizá el estado.
          </p>
        )}
        {expanded && (
          <div className="mt-2 space-y-2">
            {cheques.map((c) => (
              <div
                key={c.paymentId}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 ${
                  c.isVencido ? 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20' : 'bg-muted/30'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    {c.playerName}
                    <span className="text-muted-foreground font-normal text-sm">
                      {formatPeriod(c.period)}
                    </span>
                    {c.isVencido && (
                      <Badge variant="outline" className="text-amber-600 border-amber-500">
                        Vencido {format(new Date(c.chequeDueDate), 'dd/MM/yyyy', { locale: es })}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {c.currency} {c.amount.toLocaleString('es-AR')}
                    {!c.isVencido && (
                      <span> · Vence {format(new Date(c.chequeDueDate), 'dd/MM/yyyy', { locale: es })}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleUpdateStatus(c.paymentId, 'cheque_cobrado')}
                    disabled={updating === c.paymentId}
                  >
                    {updating === c.paymentId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-1" />
                    )}
                    Cobrado
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleUpdateStatus(c.paymentId, 'cheque_rechazado')}
                    disabled={updating === c.paymentId}
                  >
                    {updating === c.paymentId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-1" />
                    )}
                    Rechazado
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
