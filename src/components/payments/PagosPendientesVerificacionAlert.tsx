'use client';

import { useState, useEffect, useCallback } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Payment } from '@/lib/types';

interface PagosPendientesVerificacionAlertProps {
  schoolId: string;
  getToken: () => Promise<string | null>;
  onUpdated?: () => void;
}

/** Datos extraídos por IA del comprobante */
interface ExtractedReceiptData {
  amount?: number;
  date?: string;
  currency?: string;
  bank?: string;
  documentType?: string;
  referenceNumber?: string;
  payee?: string;
  issuer?: string;
}

/** Formatea período para mostrar */
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

export function PagosPendientesVerificacionAlert({
  schoolId,
  getToken,
  onUpdated,
}: PagosPendientesVerificacionAlertProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [comprobanteUrls, setComprobanteUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!schoolId) return;
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/payments?schoolId=${schoolId}&status=pending_verification&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [schoolId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const fetchComprobanteUrl = useCallback(
    async (paymentId: string) => {
      const token = await getToken();
      if (!token || !schoolId) return;
      try {
        const res = await fetch(
          `/api/payments/${paymentId}/comprobante-url?schoolId=${schoolId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setComprobanteUrls((prev) => ({ ...prev, [paymentId]: data.url }));
        }
      } catch (e) {
        console.error(e);
      }
    },
    [schoolId, getToken]
  );

  const handleVerify = async (
    paymentId: string,
    action: 'approve' | 'reject',
    amountOverride?: number,
    periodOverride?: string
  ) => {
    const token = await getToken();
    if (!token || !schoolId) return;
    setUpdating(paymentId);
    try {
      const res = await fetch(`/api/payments/${paymentId}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          action,
          ...(amountOverride != null && { amountOverride }),
          ...(periodOverride && { periodOverride }),
        }),
      });
      if (res.ok) {
        setPayments((prev) => prev.filter((p) => p.id !== paymentId));
        setComprobanteUrls((prev) => {
          const next = { ...prev };
          delete next[paymentId];
          return next;
        });
        onUpdated?.();
      } else {
        const err = await res.json();
        throw new Error(err.error ?? 'Error al actualizar');
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Error al verificar pago');
    } finally {
      setUpdating(null);
    }
  };

  if (loading || payments.length === 0) return null;

  return (
    <Alert
      className="mb-4 border-blue-500/50 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-500/30"
    >
      <AlertTitle className="flex items-center justify-between gap-2">
        <span>
          Pagos informados por WhatsApp pendientes de verificación ({payments.length})
        </span>
        <Button variant="ghost" size="icon" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </AlertTitle>
      <AlertDescription>
        <p className="mb-2 text-sm">
          Los clientes enviaron comprobantes por WhatsApp. Revisá y aprobá o rechazá cada uno.
        </p>
        {expanded && (
          <div className="mt-2 space-y-4">
            {payments.map((p) => {
              const metadata = (p.metadata ?? {}) as {
                whatsappContactName?: string;
                whatsappFrom?: string;
                comprobanteStoragePath?: string;
                extractedReceiptData?: ExtractedReceiptData;
              };
              const extracted = metadata.extractedReceiptData;
              const contactName = metadata.whatsappContactName ?? 'Usuario';
              const hasComprobante = !!metadata.comprobanteStoragePath;
              const url = comprobanteUrls[p.id];

              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-start sm:gap-4"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="font-medium flex flex-wrap items-center gap-2">
                      <span>{(p as Payment & { playerName?: string }).playerName ?? contactName}</span>
                      <Badge variant="outline" className="text-blue-600 border-blue-400">
                        WhatsApp
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatPeriod(p.period)} · {p.currency} ${p.amount.toLocaleString('es-AR')}
                    </div>
                    {extracted && (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {extracted.bank && <span>Banco: {extracted.bank}</span>}
                        {extracted.date && (
                          <span> · Fecha comprobante: {extracted.date}</span>
                        )}
                        {extracted.referenceNumber && (
                          <span> · Ref: {extracted.referenceNumber}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {hasComprobante && (
                      <div className="flex items-center gap-2">
                        {!url ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fetchComprobanteUrl(p.id)}
                          >
                            <ImageIcon className="h-4 w-4 mr-1" />
                            Ver comprobante
                          </Button>
                        ) : (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline"
                          >
                            Ver comprobante
                          </a>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleVerify(p.id, 'approve')}
                        disabled={updating === p.id}
                      >
                        {updating === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-1" />
                        )}
                        Aprobar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleVerify(p.id, 'reject')}
                        disabled={updating === p.id}
                      >
                        {updating === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4 mr-1" />
                        )}
                        Rechazar
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
