"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, FileText } from "lucide-react";
import { PaymentDocumentoAdjunto } from "@/components/payments/PaymentDocumentoAdjunto";
import { FacturaDownloadButton } from "@/components/payments/FacturaDownloadButton";
import { ClientSelectCombobox } from "@/components/players/ClientSelectCombobox";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useCollection, useDoc } from "@/firebase";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Payment, Player } from "@/lib/types";
import { formatPlayerName, playerNameSearchText } from "@/lib/format-player-name";
import {
  getPaymentMethodLabel,
  PAYMENT_METHOD_LABELS,
  REGISTER_PAYMENT_METHODS,
} from "@/lib/payments/payment-method";
import {
  MANUAL_CHARGE_TYPE_MONTHLY,
  MANUAL_CHARGE_TYPE_OPTIONS,
  MANUAL_CHARGE_TYPE_OTHER,
  MANUAL_CHARGE_TYPE_REGISTRATION,
  resolveManualCharge,
} from "@/lib/payments/charge-concepts";
import type { BoatPricingConfig } from "@/lib/types/boat-pricing";
import { getDefaultBoatPricingItems } from "@/lib/types/boat-pricing";
import { calculateClientMonthlyPricing } from "@/lib/payments/client-monthly-pricing";

/** Pago con nombre de jugador enriquecido por la API */
type PaymentWithPlayerName = Payment & {
  playerName?: string;
  requiereFactura?: boolean;
  facturado?: boolean;
  documentoAdjuntoStoragePath?: string;
  documentoAdjuntoNombre?: string;
  facturaStoragePath?: string;
  facturaNumero?: number;
  facturaPtoVta?: number;
  facturaTipo?: string;
};

interface PaymentsTabProps {
  schoolId: string;
  getToken: () => Promise<string | null>;
  manualOpen?: boolean;
  onManualOpenChange?: (open: boolean) => void;
  /** Razón social del emisor fiscal (náutica) para mostrar en la UI */
  facturacionRazonSocial?: string;
  gestionarNauticaHref?: string;
}

const STATUS_LABELS: Record<string, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  rejected: "Rechazado",
  refunded: "Reembolsado",
};

const PAYMENT_METHOD_FILTER_OPTIONS = [
  "transfer",
  "cash",
  "cheque",
  "mercadopago",
  "card_credit",
  "card_debit",
  "card",
  "excel_import",
  "manual",
] as const;

const REGISTRATION_PERIOD = "inscripcion";

/** Convierte "2026-02" → "FEBRERO-2026", "inscripcion" → "Inscripción", "ropa-1" → "Pago de ropa (1)", "extra-202602-*" → "Servicio (Feb 2026)" */
function formatPeriodDisplay(period: string, payment?: PaymentWithPlayerName): string {
  if (period === REGISTRATION_PERIOD) return "Inscripción";
  const ropaMatch = period.match(/^ropa-(\d+)$/);
  if (ropaMatch) return `Concepto ${ropaMatch[1]}`;
  const extraMatch = period.match(/^extra-(\d{6})-\d+$/);
  if (extraMatch) {
    const y = extraMatch[1].slice(0, 4);
    const m = extraMatch[1].slice(4, 6);
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    const monthName = format(date, "MMM", { locale: es });
    const concept = (payment?.metadata as { concept?: string } | undefined)?.concept;
    return concept ? `${concept} (${monthName} ${y})` : `Servicio (${monthName} ${y})`;
  }
  if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period;
  const concept = (payment?.metadata as { concept?: string } | undefined)?.concept;
  if (concept) return concept;
  const [y, m] = period.split("-");
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  const monthName = format(date, "MMMM", { locale: es }).toUpperCase();
  return `${monthName}-${y}`;
}

const MONTHS: { value: string; label: string }[] = [
  { value: "01", label: "Enero" }, { value: "02", label: "Febrero" }, { value: "03", label: "Marzo" },
  { value: "04", label: "Abril" }, { value: "05", label: "Mayo" }, { value: "06", label: "Junio" },
  { value: "07", label: "Julio" }, { value: "08", label: "Agosto" }, { value: "09", label: "Septiembre" },
  { value: "10", label: "Octubre" }, { value: "11", label: "Noviembre" }, { value: "12", label: "Diciembre" },
];

const currentPeriod = () =>
  `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

const currentDate = () => format(new Date(), "yyyy-MM-dd");

function defaultMonthlyConcept(period: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return "Cuota mensual";
  const [year, month] = period.split("-").map(Number);
  return `Cuota mensual — ${format(new Date(year, month - 1, 1), "MMMM yyyy", { locale: es })}`;
}

/** Años desde 2026 en adelante (y los próximos años) */
function getYears(): number[] {
  const current = new Date().getFullYear();
  const start = 2026;
  const end = Math.max(current + 2, start + 2);
  const years: number[] = [];
  for (let y = end; y >= start; y--) {
    years.push(y);
  }
  return years;
}

export function PaymentsTab({
  schoolId,
  getToken,
  manualOpen: manualOpenProp,
  onManualOpenChange,
  facturacionRazonSocial,
}: PaymentsTabProps) {
  const [payments, setPayments] = useState<PaymentWithPlayerName[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    period: "",
    status: "",
    method: "",
    facturado: "no",
  });
  const [manualOpenLocal, setManualOpenLocal] = useState(false);
  const manualOpen = manualOpenProp ?? manualOpenLocal;
  const setManualOpen = onManualOpenChange ?? setManualOpenLocal;
  const [manualPlayerId, setManualPlayerId] = useState("");
  const [manualChargeType, setManualChargeType] = useState(MANUAL_CHARGE_TYPE_MONTHLY);
  const [manualConceptCustom, setManualConceptCustom] = useState("");
  const [manualPeriod, setManualPeriod] = useState(currentPeriod());
  const [manualMonthlyConcept, setManualMonthlyConcept] = useState(
    defaultMonthlyConcept(currentPeriod())
  );
  const [manualPaidAt, setManualPaidAt] = useState(currentDate());
  const [manualAmount, setManualAmount] = useState("");
  const [manualMethod, setManualMethod] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [unpaidPeriods, setUnpaidPeriods] = useState<{ period: string; amount: number; currency: string; label: string }[]>([]);
  const [unpaidLoading, setUnpaidLoading] = useState(false);
  const manualChargeTypeRef = useRef(manualChargeType);
  manualChargeTypeRef.current = manualChargeType;

  const monthlyUnpaid = useMemo(
    () => unpaidPeriods.filter((u) => /^\d{4}-(0[1-9]|1[0-2])$/.test(u.period)),
    [unpaidPeriods]
  );
  const registrationUnpaid = useMemo(
    () => unpaidPeriods.find((u) => u.period === REGISTRATION_PERIOD),
    [unpaidPeriods]
  );

  const applyChargeTypeDefaults = useCallback(
    (
      chargeType: string,
      unpaid: { period: string; amount: number; currency: string; label: string }[],
      suggestedMonthlyAmount?: number
    ) => {
      if (chargeType === MANUAL_CHARGE_TYPE_MONTHLY) {
        const firstMonthly = unpaid.find((u) => /^\d{4}-(0[1-9]|1[0-2])$/.test(u.period));
        if (firstMonthly) {
          setManualPeriod(firstMonthly.period);
          setManualMonthlyConcept(defaultMonthlyConcept(firstMonthly.period));
          setManualAmount(
            suggestedMonthlyAmount === undefined
              ? String(firstMonthly.amount)
              : suggestedMonthlyAmount > 0
                ? String(suggestedMonthlyAmount)
                : ""
          );
        } else {
          const period = currentPeriod();
          setManualPeriod(period);
          setManualMonthlyConcept(defaultMonthlyConcept(period));
          if (suggestedMonthlyAmount !== undefined) {
            setManualAmount(suggestedMonthlyAmount > 0 ? String(suggestedMonthlyAmount) : "");
          }
        }
        return;
      }
      if (chargeType === MANUAL_CHARGE_TYPE_REGISTRATION) {
        const inscription = unpaid.find((u) => u.period === REGISTRATION_PERIOD);
        setManualPeriod(REGISTRATION_PERIOD);
        if (inscription) setManualAmount(String(inscription.amount));
        return;
      }
      setManualPeriod(currentPeriod());
    },
    []
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [facturando, setFacturando] = useState(false);
  const [modoSimulacion, setModoSimulacion] = useState(false);
  const [cancelaUsd, setCancelaUsd] = useState(false);
  const [enviarPorEmail, setEnviarPorEmail] = useState(false);
  const { toast } = useToast();

  const { data: players } = useCollection<Player>(
    schoolId ? `schools/${schoolId}/players` : "",
    { orderBy: ["lastName", "asc"] }
  );
  const { data: boatPricing } = useDoc<BoatPricingConfig>(
    schoolId ? `schools/${schoolId}/boatPricingConfig/default` : ""
  );
  const pricingItems = useMemo(
    () =>
      boatPricing?.items?.length
        ? boatPricing.items
        : getDefaultBoatPricingItems(),
    [boatPricing]
  );
  const pricingByPlayer = useMemo(
    () =>
      new Map(
        (players ?? []).map((player) => [
          player.id,
          calculateClientMonthlyPricing(player, pricingItems),
        ])
      ),
    [players, pricingItems]
  );
  const selectedMonthlyPricing = manualPlayerId
    ? pricingByPlayer.get(manualPlayerId)
    : undefined;
  const playerOptions = useMemo(
    () =>
      (players ?? [])
        .filter((p) => !p.archived)
        .map((p) => ({
          id: p.id,
          displayName: formatPlayerName(p) || p.email || p.id,
          searchText: playerNameSearchText(p),
          secondaryText: (() => {
            const pricing = pricingByPlayer.get(p.id);
            if (!pricing || pricing.total <= 0) return "Sin precio asignado";
            const warning = pricing.missing.length > 0 ? " · incompleto" : "";
            return `ARS ${pricing.total.toLocaleString("es-AR")}/mes${warning}`;
          })(),
        })),
    [players, pricingByPlayer]
  );

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    if (!token) return;
    const params = new URLSearchParams({ schoolId, limit: "500" });
    if (filters.period) params.set("period", filters.period);
    if (filters.status) params.set("status", filters.status);
    if (filters.method) params.set("method", filters.method);
    if (filters.facturado) params.set("facturado", filters.facturado);
    try {
      const res = await fetch(`/api/payments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? data.error ?? "Error al cargar pagos");
      }
      const data = await res.json();
      setPayments(
        data.payments.map((p: PaymentWithPlayerName & { paidAt?: string; createdAt?: string }) => ({
          ...p,
          paidAt: p.paidAt ? new Date(p.paidAt) : undefined,
          createdAt: new Date(p.createdAt!),
        }))
      );
      setTotal(data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [schoolId, filters.period, filters.status, filters.method, filters.facturado, getToken]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const fetchUnpaidForPlayer = useCallback(async () => {
    if (!manualPlayerId || !schoolId) {
      setUnpaidPeriods((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    setUnpaidLoading(true);
    const token = await getToken();
    if (!token) {
      setUnpaidLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/payments/player-unpaid?schoolId=${encodeURIComponent(schoolId)}&playerId=${encodeURIComponent(manualPlayerId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const unpaid = data.unpaid ?? [];
        setUnpaidPeriods(unpaid);
        if (
          manualChargeTypeRef.current === MANUAL_CHARGE_TYPE_MONTHLY ||
          manualChargeTypeRef.current === MANUAL_CHARGE_TYPE_REGISTRATION
        ) {
          applyChargeTypeDefaults(
            manualChargeTypeRef.current,
            unpaid,
            selectedMonthlyPricing?.total ?? 0
          );
        }
      } else {
        setUnpaidPeriods([]);
      }
    } catch {
      setUnpaidPeriods([]);
    } finally {
      setUnpaidLoading(false);
    }
  }, [
    manualPlayerId,
    schoolId,
    getToken,
    applyChargeTypeDefaults,
    selectedMonthlyPricing?.total,
  ]);

  useEffect(() => {
    fetchUnpaidForPlayer();
  }, [fetchUnpaidForPlayer]);

  useEffect(() => {
    if (
      manualChargeType === MANUAL_CHARGE_TYPE_MONTHLY &&
      manualPlayerId
    ) {
      setManualAmount(
        selectedMonthlyPricing && selectedMonthlyPricing.total > 0
          ? String(selectedMonthlyPricing.total)
          : ""
      );
    }
  }, [manualPlayerId, selectedMonthlyPricing?.total, manualChargeType]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(approvedFacturable.map((p) => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleFacturar = async () => {
    if (selectedIds.size === 0) {
      toast({ variant: "destructive", title: "Seleccioná al menos un pago para facturar." });
      return;
    }
    setFacturando(true);
    const token = await getToken();
    if (!token) {
      toast({ variant: "destructive", title: "No se pudo obtener sesión." });
      setFacturando(false);
      return;
    }
    try {
      const res = await fetch("/api/facturas/emit-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          paymentIds: Array.from(selectedIds),
          simulation: modoSimulacion,
          sendEmail: enviarPorEmail,
          cancelaMismaMonedaExtranjera: cancelaUsd,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Error al facturar");
      }
      const okCount = data.processed ?? 0;
      const failCount = data.failed ?? 0;
      const emailSentCount = data.emailSent ?? 0;
      const emailSkippedCount = data.emailSkipped ?? 0;
      const emailFailedCount = data.emailFailed ?? 0;
      const okResults = (data.results ?? []).filter((r: { ok: boolean }) => r.ok);
      const filenames = okResults.map((r: { filename?: string }) => r.filename).filter(Boolean) as string[];
      const failMsgs = (data.results ?? [])
        .filter((r: { ok: boolean; error?: string }) => !r.ok && r.error)
        .map((r: { error: string }) => r.error);
      const emailSkipMsgs = (data.results ?? [])
        .filter((r: { emailSkippedReason?: string }) => r.emailSkippedReason)
        .map((r: { emailSkippedReason: string }) => r.emailSkippedReason);
      const emailErrorMsgs = (data.results ?? [])
        .filter((r: { emailError?: string }) => r.emailError)
        .map((r: { emailError: string }) => r.emailError);

      const emailSummary = enviarPorEmail
        ? [
            emailSentCount > 0 ? `${emailSentCount} enviada(s) por email` : null,
            emailSkippedCount > 0 ? `${emailSkippedCount} sin email` : null,
            emailFailedCount > 0 ? `${emailFailedCount} con error de email` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null;

      if (okCount > 0 && filenames.length > 0) {
        toast({
          title: modoSimulacion ? `Simulación: ${okCount} factura(s) generada(s)` : `${okCount} factura(s) emitida(s) a AFIP`,
          description: [
            failCount > 0 ? `${failCount} fallaron.` : null,
            emailSummary,
            "Hacé clic en 'Descargar' para abrir los PDF.",
          ]
            .filter(Boolean)
            .join(" "),
          action: (
            <ToastAction
              altText="Descargar"
              onClick={async () => {
                const t = await getToken();
                if (!t) return;
                for (const fn of filenames) {
                  const r = await fetch(`/api/facturas/${encodeURIComponent(fn)}`, {
                    headers: { Authorization: `Bearer ${t}` },
                  });
                  if (!r.ok) {
                    const err = await r.json().catch(() => ({}));
                    toast({
                      variant: "destructive",
                      title: `No se pudo descargar ${fn}`,
                      description: (err as { error?: string }).error ?? r.statusText,
                    });
                    continue;
                  }
                  const blob = await r.blob();
                  if (!blob.type.includes("pdf") && blob.size < 500) {
                    toast({
                      variant: "destructive",
                      title: `Archivo inválido: ${fn}`,
                      description: "El servidor no devolvió un PDF válido.",
                    });
                    continue;
                  }
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = fn;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }
              }}
            >
              Descargar
            </ToastAction>
          ),
        });
      } else if (okCount > 0 && filenames.length === 0) {
        toast({
          variant: "destructive",
          title: "Error: las facturas no se guardaron",
          description: "El servidor reportó éxito pero no se generaron archivos. Revisá la consola del servidor.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "No se generó ninguna factura",
          description: failMsgs[0] ?? "Revisá la consola del servidor para más detalles.",
        });
      }
      if (failMsgs.length > 0) {
        failMsgs.slice(0, 3).forEach((msg: string) => toast({ variant: "destructive", title: "Error", description: msg }));
      }
      if (emailSkipMsgs.length > 0) {
        emailSkipMsgs.slice(0, 3).forEach((msg: string) =>
          toast({ title: "Email no enviado", description: msg })
        );
      }
      if (emailErrorMsgs.length > 0) {
        emailErrorMsgs.slice(0, 3).forEach((msg: string) =>
          toast({ variant: "destructive", title: "Error al enviar email", description: msg })
        );
      }
      setSelectedIds(new Set());
      fetchPayments();
    } catch (e) {
      toast({
        variant: "destructive",
        title: e instanceof Error ? e.message : "Error al facturar",
      });
    } finally {
      setFacturando(false);
    }
  };

  const resetManualForm = () => {
    setManualPlayerId("");
    setManualChargeType(MANUAL_CHARGE_TYPE_MONTHLY);
    setManualConceptCustom("");
    const period = currentPeriod();
    setManualPeriod(period);
    setManualMonthlyConcept(defaultMonthlyConcept(period));
    setManualPaidAt(currentDate());
    setManualAmount("");
    setManualMethod("");
    setUnpaidPeriods([]);
  };

  const handleChargeTypeChange = (value: string) => {
    setManualChargeType(value);
    applyChargeTypeDefaults(value, unpaidPeriods, selectedMonthlyPricing?.total ?? 0);
  };

  const handleManualPayment = async () => {
    const amount = parseFloat(manualAmount);
    const resolved = resolveManualCharge(manualChargeType, manualConceptCustom);
    if (!manualPlayerId || Number.isNaN(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Completá cliente y monto válido." });
      return;
    }
    if ("error" in resolved) {
      toast({ variant: "destructive", title: resolved.error });
      return;
    }
    if (resolved.kind === "monthly" && !manualPeriod) {
      toast({ variant: "destructive", title: "Completá el período para la cuota mensual." });
      return;
    }
    if (
      resolved.kind === "monthly" &&
      (!manualPaidAt || !manualMonthlyConcept.trim())
    ) {
      toast({
        variant: "destructive",
        title: "Completá la fecha de pago y el concepto.",
      });
      return;
    }
    if (!manualMethod) {
      toast({ variant: "destructive", title: "Elegí el medio de pago." });
      return;
    }
    setManualSubmitting(true);
    const token = await getToken();
    if (!token) {
      toast({ variant: "destructive", title: "No se pudo obtener sesión." });
      setManualSubmitting(false);
      return;
    }
    try {
      const res =
        resolved.kind === "service"
          ? await fetch("/api/payments/service-charge", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                playerId: manualPlayerId,
                schoolId,
                concept: resolved.concept,
                amount,
                currency: "ARS",
                period: manualPeriod || currentPeriod(),
                method: manualMethod,
              }),
            })
          : await fetch("/api/payments/manual", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                playerId: manualPlayerId,
                schoolId,
                period: resolved.kind === "registration" ? REGISTRATION_PERIOD : manualPeriod,
                amount,
                currency: "ARS",
                method: manualMethod,
                ...(resolved.kind === "monthly"
                  ? {
                      paidAt: manualPaidAt,
                      concept: manualMonthlyConcept.trim(),
                    }
                  : {}),
              }),
            });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Error al registrar pago");
      }
      toast({
        title: "Cobro registrado correctamente.",
        description:
          resolved.kind === "service"
            ? `Concepto: ${resolved.concept}`
            : resolved.kind === "registration"
              ? "Imputado a inscripción"
              : manualMonthlyConcept.trim(),
      });
      setManualOpen(false);
      resetManualForm();
      fetchPayments();
    } catch (e) {
      toast({
        variant: "destructive",
        title: e instanceof Error ? e.message : "Error al registrar pago",
      });
    } finally {
      setManualSubmitting(false);
    }
  };

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();
  const isInCurrentMonth = (p: Payment) => {
    const date = p.paidAt ?? p.createdAt;
    const ts = date.getTime();
    return ts >= currentMonthStart && ts <= currentMonthEnd;
  };
  const approvedInList = payments.filter((p) => p.status === "approved");
  const approvedFacturable = approvedInList.filter(
    (p) => (p as PaymentWithPlayerName).requiereFactura !== false && !(p as PaymentWithPlayerName).facturado
  );
  const totalInList = approvedInList.reduce((s, p) => s + p.amount, 0);
  const approvedThisMonth = approvedInList.filter(isInCurrentMonth);
  const totalThisMonth = approvedThisMonth.reduce((s, p) => s + p.amount, 0);
  const currentMonthLabel = formatPeriodDisplay(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );

  const filterMonth = filters.period ? filters.period.slice(5, 7) : "all";
  const filterYear = filters.period ? filters.period.slice(0, 4) : "all";
  const setPeriodFromMonthYear = (month: string, year: string) => {
    if (month === "all" || year === "all" || !month || !year) {
      setFilters((f) => ({ ...f, period: "" }));
      return;
    }
    setFilters((f) => ({ ...f, period: `${year}-${month}` }));
  };

  return (
    <div className="space-y-4 min-w-0">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Pagos aprobados en lista</p>
          <p className="text-2xl font-bold">
            {loading ? "Cargando…" : approvedInList.length}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total en lista</p>
          <p className="text-2xl font-bold">
            {loading ? "Cargando…" : `ARS ${totalInList.toLocaleString("es-AR")}`}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Mes en curso ({currentMonthLabel})</p>
          <p className="text-2xl font-bold">
            {loading ? "Cargando…" : `${approvedThisMonth.length} pagos`}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total mes en curso</p>
          <p className="text-2xl font-bold">
            {loading ? "Cargando…" : `ARS ${totalThisMonth.toLocaleString("es-AR")}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filterMonth}
          onValueChange={(v) =>
            setPeriodFromMonthYear(v, filterYear === "all" ? String(new Date().getFullYear()) : filterYear)
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {MONTHS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterYear}
          onValueChange={(v) =>
            setPeriodFromMonthYear(
              filterMonth === "all" ? String(new Date().getMonth() + 1).padStart(2, "0") : filterMonth,
              v
            )
          }
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {getYears().map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.status}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.method || "all"}
          onValueChange={(v) => setFilters((f) => ({ ...f, method: v === "all" ? "" : v }))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Medio de pago" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {PAYMENT_METHOD_FILTER_OPTIONS.map((k) => (
              <SelectItem key={k} value={k}>{PAYMENT_METHOD_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.facturado || "all"}
          onValueChange={(v) => setFilters((f) => ({ ...f, facturado: v === "all" ? "" : v }))}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Facturación" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no">Pendiente de facturación</SelectItem>
            <SelectItem value="yes">Facturado</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
        {approvedFacturable.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:border-l sm:pl-4">
            {facturacionRazonSocial && (
              <span className="text-xs text-muted-foreground hidden lg:inline max-w-[180px] truncate" title={facturacionRazonSocial}>
                Emisor: {facturacionRazonSocial}
              </span>
            )}
            <label
              className={`flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap rounded-md px-2 py-1 ${modoSimulacion ? "bg-amber-100 dark:bg-amber-900/30" : "bg-emerald-50 dark:bg-emerald-900/20"}`}
              title={modoSimulacion ? "No se envía a ARCA" : "Emisión real contra ARCA"}
            >
              <Checkbox
                checked={modoSimulacion}
                onCheckedChange={(c) => setModoSimulacion(c === true)}
              />
              <span className={`text-xs sm:text-sm font-medium ${modoSimulacion ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"}`}>
                {modoSimulacion ? "Simulación (sin CAE)" : "ARCA real"}
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap" title="USD cancelado en la misma moneda (CanMisMonExt)">
              <Checkbox checked={cancelaUsd} onCheckedChange={(c) => setCancelaUsd(c === true)} />
              <span className="text-muted-foreground text-xs sm:text-sm">USD pagado en USD</span>
            </label>
            <label
              className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap"
              title="Si está marcado, se envía el PDF al email del cliente (si tiene uno cargado)"
            >
              <Checkbox
                checked={enviarPorEmail}
                onCheckedChange={(c) => setEnviarPorEmail(c === true)}
              />
              <span className="text-muted-foreground text-xs sm:text-sm">Enviar por email</span>
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFacturar}
              disabled={facturando || selectedIds.size === 0}
            >
              {facturando ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Facturar ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-md border bg-muted/30">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Cargando pagos…</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border min-w-0">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-2">
                  <Checkbox
                    checked={selectedIds.size === approvedFacturable.length && approvedFacturable.length > 0}
                    onCheckedChange={(c) => toggleSelectAll(c === true)}
                  />
                </TableHead>
                <TableHead className="text-xs sm:text-sm whitespace-nowrap">Concepto / período</TableHead>
                <TableHead className="text-xs sm:text-sm">Cliente</TableHead>
                <TableHead className="text-xs sm:text-sm">Monto</TableHead>
                <TableHead className="text-xs sm:text-sm whitespace-nowrap">Medio de pago</TableHead>
                <TableHead className="text-xs sm:text-sm">Estado</TableHead>
                <TableHead className="text-xs sm:text-sm whitespace-nowrap">Facturado</TableHead>
                <TableHead className="text-xs sm:text-sm whitespace-nowrap w-20">Adj.</TableHead>
                <TableHead className="text-xs sm:text-sm whitespace-nowrap">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    {filters.facturado === "no"
                      ? "No hay pagos pendientes de facturación. Cambiá el filtro a «Todos» para ver el resto."
                      : "No hay pagos para mostrar"}
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="w-10 px-2">
                      {p.status === "approved" &&
                      (p as PaymentWithPlayerName).requiereFactura !== false &&
                      !(p as PaymentWithPlayerName).facturado ? (
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                        />
                      ) : p.status === "approved" && (p as PaymentWithPlayerName).facturado ? (
                        <span className="text-xs text-muted-foreground" title="Ya facturado">—</span>
                      ) : p.status === "approved" ? (
                        <span className="text-xs text-muted-foreground" title="Cliente marcado como no facturar">—</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{formatPeriodDisplay(p.period, p)}</TableCell>
                    <TableCell>
                      <span>{p.playerName ?? p.playerId}</span>
                      {p.status === "approved" && (p as PaymentWithPlayerName).requiereFactura === false && (
                        <Badge variant="secondary" className="ml-1 text-xs">No factura</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.currency} {p.amount.toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell>
                      {getPaymentMethodLabel(p)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === "approved"
                            ? "default"
                            : p.status === "rejected"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(p as PaymentWithPlayerName).facturado ? (
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            Sí
                          </Badge>
                          <FacturaDownloadButton
                            paymentId={p.id}
                            schoolId={schoolId}
                            getToken={getToken}
                            facturaTipo={p.facturaTipo}
                            facturaPtoVta={p.facturaPtoVta}
                            facturaNumero={p.facturaNumero}
                            hasPdf={!!(p.facturaStoragePath || (p.facturaNumero && p.facturaPtoVta))}
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">No</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.status === "approved" ? (
                        <PaymentDocumentoAdjunto
                          paymentId={p.id}
                          schoolId={schoolId}
                          getToken={getToken}
                          hasAdjunto={!!(p as PaymentWithPlayerName).documentoAdjuntoStoragePath}
                          adjuntoNombre={(p as PaymentWithPlayerName).documentoAdjuntoNombre}
                          onUpdated={fetchPayments}
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.paidAt
                        ? format(p.paidAt, "dd/MM/yyyy HH:mm", { locale: es })
                        : format(p.createdAt, "dd/MM/yyyy", { locale: es })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={manualOpen}
        onOpenChange={(open) => {
          if (!open) resetManualForm();
          setManualOpen(open);
        }}
      >
        <DialogContent
          className="overflow-visible sm:max-w-lg"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest?.('[role="listbox"], [role="listbox"] *')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Registrar cobro manual</DialogTitle>
            <DialogDescription>
              Elegí qué se cobra: cuota mensual, inscripción, amarra, un servicio u otro concepto.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-visible">
            <div>
              <Label htmlFor="manual-player">Cliente</Label>
              <div className="mt-1">
                <ClientSelectCombobox
                  id="manual-player"
                  value={manualPlayerId}
                  onChange={setManualPlayerId}
                  players={playerOptions}
                  placeholder="Elegí un cliente"
                  searchPlaceholder="Escribí apellido o nombre…"
                />
              </div>
              {selectedMonthlyPricing && (
                <div className="mt-2 rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">Costo mensual asignado</span>
                    <span className="font-semibold">
                      ARS {selectedMonthlyPricing.total.toLocaleString("es-AR")}
                    </span>
                  </div>
                  {selectedMonthlyPricing.lines.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {selectedMonthlyPricing.lines.map((line) => (
                        <li key={line.id} className="flex justify-between gap-3">
                          <span>{line.label}</span>
                          <span className="shrink-0">
                            ARS {line.amount.toLocaleString("es-AR")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {selectedMonthlyPricing.missing.length > 0 && (
                    <div className="mt-2 flex gap-2 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {selectedMonthlyPricing.missing.join(". ")}. Podés ingresar
                        el monto manualmente.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="manual-charge-type">Qué se cobra</Label>
              <Select value={manualChargeType} onValueChange={handleChargeTypeChange}>
                <SelectTrigger id="manual-charge-type" className="mt-1">
                  <SelectValue placeholder="Elegí el concepto de cobro" />
                </SelectTrigger>
                <SelectContent onCloseAutoFocus={(e) => e.preventDefault()}>
                  {MANUAL_CHARGE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {manualChargeType === MANUAL_CHARGE_TYPE_OTHER && (
              <div>
                <Label htmlFor="manual-concept-custom">Concepto</Label>
                <Input
                  id="manual-concept-custom"
                  value={manualConceptCustom}
                  onChange={(e) => setManualConceptCustom(e.target.value)}
                  placeholder="Ej: Alquiler de kayak"
                  maxLength={200}
                  className="mt-1"
                />
              </div>
            )}
            {manualChargeType === MANUAL_CHARGE_TYPE_MONTHLY && manualPlayerId && (
              <div>
                <Label>Imputar a la cuota</Label>
                {unpaidLoading ? (
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando cuotas adeudadas…
                  </p>
                ) : monthlyUnpaid.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    Este cliente no tiene cuotas adeudadas. Podés registrar un pago adelantado con período manual.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto rounded-md border p-2">
                    {monthlyUnpaid.map((u) => (
                      <label
                        key={u.period}
                        className={`flex items-center justify-between gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 ${
                          manualPeriod === u.period ? "bg-muted" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="manual-period"
                          checked={manualPeriod === u.period}
                          onChange={() => {
                            setManualPeriod(u.period);
                            setManualMonthlyConcept(defaultMonthlyConcept(u.period));
                            setManualAmount(
                              selectedMonthlyPricing && selectedMonthlyPricing.total > 0
                                ? String(selectedMonthlyPricing.total)
                                : ""
                            );
                          }}
                          className="sr-only"
                        />
                        <span className="font-medium">{u.label}</span>
                        <span className="text-sm text-muted-foreground">
                          {selectedMonthlyPricing && selectedMonthlyPricing.total > 0
                            ? `ARS ${selectedMonthlyPricing.total.toLocaleString("es-AR")}`
                            : "Ingresar importe"}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            {manualChargeType === MANUAL_CHARGE_TYPE_MONTHLY &&
              (!manualPlayerId || monthlyUnpaid.length === 0) && (
                <div>
                  <Label htmlFor="manual-period">Período (YYYY-MM) — pago adelantado</Label>
                  <Input
                    id="manual-period"
                    value={manualPeriod}
                    onChange={(e) => {
                      setManualPeriod(e.target.value);
                      setManualMonthlyConcept(defaultMonthlyConcept(e.target.value));
                    }}
                    placeholder="2026-02"
                    className="mt-1"
                  />
                </div>
              )}
            {manualChargeType === MANUAL_CHARGE_TYPE_REGISTRATION && (
              <p className="text-sm text-muted-foreground">
                {registrationUnpaid
                  ? `Inscripción pendiente: ${registrationUnpaid.currency} ${registrationUnpaid.amount.toLocaleString("es-AR")}`
                  : "Este cliente no tiene inscripción pendiente. Podés registrarla igual si corresponde."}
              </p>
            )}
            {manualChargeType !== MANUAL_CHARGE_TYPE_MONTHLY &&
              manualChargeType !== MANUAL_CHARGE_TYPE_REGISTRATION && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Mes</Label>
                    <Select
                      value={manualPeriod.slice(5, 7) || String(new Date().getMonth() + 1).padStart(2, "0")}
                      onValueChange={(month) => {
                        const year = manualPeriod.slice(0, 4) || String(new Date().getFullYear());
                        setManualPeriod(`${year}-${month}`);
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent onCloseAutoFocus={(e) => e.preventDefault()}>
                        {MONTHS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Año</Label>
                    <Select
                      value={manualPeriod.slice(0, 4) || String(new Date().getFullYear())}
                      onValueChange={(year) => {
                        const month =
                          manualPeriod.slice(5, 7) || String(new Date().getMonth() + 1).padStart(2, "0");
                        setManualPeriod(`${year}-${month}`);
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent onCloseAutoFocus={(e) => e.preventDefault()}>
                        {getYears().map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            {manualChargeType === MANUAL_CHARGE_TYPE_MONTHLY && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="manual-paid-at">Fecha de pago</Label>
                  <Input
                    id="manual-paid-at"
                    type="date"
                    value={manualPaidAt}
                    onChange={(e) => setManualPaidAt(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="manual-monthly-concept">Concepto</Label>
                  <Input
                    id="manual-monthly-concept"
                    value={manualMonthlyConcept}
                    onChange={(e) => setManualMonthlyConcept(e.target.value)}
                    placeholder="Cuota mensual"
                    maxLength={200}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="manual-amount">Monto (ARS)</Label>
              <Input
                id="manual-amount"
                type="number"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="Ingresá el importe"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="manual-method">Medio de pago</Label>
              <Select value={manualMethod} onValueChange={setManualMethod}>
                <SelectTrigger id="manual-method" className="mt-1">
                  <SelectValue placeholder="Elegí el medio de pago" />
                </SelectTrigger>
                <SelectContent onCloseAutoFocus={(e) => e.preventDefault()}>
                  {REGISTER_PAYMENT_METHODS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {PAYMENT_METHOD_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetManualForm();
                setManualOpen(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleManualPayment}
              disabled={manualSubmitting}
            >
              {manualSubmitting ? "Guardando…" : "Registrar cobro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
