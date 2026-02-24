"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuth } from "firebase/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Banknote,
  Receipt,
  AlertTriangle,
  Ship,
  Anchor,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type DelinquentInfo = {
  playerId: string;
  playerName?: string;
  schoolId: string;
  period: string;
  amount: number;
  currency: string;
  dueDate: Date;
};

type PaymentItem = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  paidAt?: string;
};

type ExpenseItem = {
  id: string;
  status: string;
  amounts?: { total?: number; currency?: string };
  createdAt?: string;
};

type RegistroItem = {
  id: string;
  tipo: "solicitud_creada" | "tomada" | "regreso";
  nombreCliente: string;
  nombreEmbarcacion: string;
  operadorNombre?: string;
  createdAt: number | null;
};

type SolicitudItem = {
  id: string;
  nombreCliente: string;
  nombreEmbarcacion: string;
  status: string;
};

interface DashboardStatsProps {
  schoolId: string;
  getToken: () => Promise<string | null>;
}

const TIPO_LABEL: Record<string, string> = {
  solicitud_creada: "Solicitud",
  tomada: "Salió",
  regreso: "Regresó",
};

function formatCurrency(amount: number, currency = "ARS"): string {
  return `${currency} ${amount.toLocaleString("es-AR")}`;
}

export function DashboardStats({ schoolId, getToken }: DashboardStatsProps) {
  const [loading, setLoading] = useState(true);
  const [delinquents, setDelinquents] = useState<DelinquentInfo[]>([]);
  const [paymentsMonth, setPaymentsMonth] = useState<PaymentItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [registro, setRegistro] = useState<RegistroItem[]>([]);
  const [pendientes, setPendientes] = useState<SolicitudItem[]>([]);

  const fetchAll = useCallback(async () => {
    if (!schoolId) return;
    const token = await getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const now = new Date();
    const dateFrom = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
    const dateTo = format(now, "yyyy-MM-dd");

    try {
      const [delRes, payRes, expRes, regRes, pendRes] = await Promise.all([
        fetch(`/api/payments/delinquents?schoolId=${schoolId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(
          `/api/payments?schoolId=${schoolId}&dateFrom=${dateFrom}&dateTo=${dateTo}&limit=500`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
        fetch(`/api/expenses?schoolId=${schoolId}&limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/solicitud-embarcacion/registro?schoolId=${schoolId}&limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/solicitud-embarcacion?schoolId=${schoolId}&status=pendiente`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (delRes.ok) {
        const d = await delRes.json();
        setDelinquents(
          (d.delinquents ?? []).map((x: DelinquentInfo & { dueDate: string }) => ({
            ...x,
            dueDate: new Date(x.dueDate),
          }))
        );
      }
      if (payRes.ok) {
        const p = await payRes.json();
        setPaymentsMonth(p.payments ?? []);
      }
      if (expRes.ok) {
        const e = await expRes.json();
        setExpenses(e.expenses ?? []);
      }
      if (regRes.ok) {
        const r = await regRes.json();
        setRegistro(r.items ?? []);
      }
      if (pendRes.ok) {
        const s = await pendRes.json();
        setPendientes(s.items ?? []);
      }
    } catch (err) {
      console.error("[DashboardStats]", err);
    } finally {
      setLoading(false);
    }
  }, [schoolId, getToken]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const todayMs = todayStart.getTime();
  const tomorrowMs = todayEnd.getTime();

  const registroHoy = registro.filter((r) => {
    const ms = r.createdAt ?? 0;
    return ms >= todayMs && ms < tomorrowMs;
  });

  const approvedPayments = paymentsMonth.filter((p) => p.status === "approved");
  const totalCobrado = approvedPayments.reduce((s, p) => s + (p.amount ?? 0), 0);
  const cantidadPagos = approvedPayments.length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const expensesDelMes = expenses.filter((e) => {
    const created = e.createdAt ? new Date(e.createdAt).getTime() : 0;
    return created >= monthStart && e.status !== "cancelled";
  });
  const totalGastos = expensesDelMes.reduce(
    (s, e) => s + (e.amounts?.total ?? 0),
    0
  );
  const gastosPendientes = expenses.filter((e) => e.status === "draft").length;

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/payments">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pagos del mes</CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(totalCobrado)}
              </div>
              <p className="text-xs text-muted-foreground">
                {cantidadPagos} pago{cantidadPagos !== 1 ? "s" : ""} cobrado
                {cantidadPagos !== 1 ? "s" : ""} en{" "}
                {format(now, "MMMM yyyy", { locale: es })}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/expenses">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gastos del mes</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(totalGastos)}
              </div>
              <p className="text-xs text-muted-foreground">
                {gastosPendientes > 0 ? (
                  <span className="text-amber-600 dark:text-amber-500">
                    {gastosPendientes} pendiente{gastosPendientes !== 1 ? "s" : ""}{" "}
                    de confirmar
                  </span>
                ) : (
                  "Todos confirmados"
                )}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/payments?tab=delinquents">
          <Card
            className={`hover:bg-muted/50 transition-colors cursor-pointer h-full ${
              delinquents.length > 0 ? "border-amber-500/50" : ""
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Deudores morosos</CardTitle>
              <AlertTriangle
                className={`h-4 w-4 ${
                  delinquents.length > 0 ? "text-amber-600" : "text-muted-foreground"
                }`}
              />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  delinquents.length > 0 ? "text-amber-600 dark:text-amber-500" : ""
                }`}
              >
                {delinquents.length}
              </div>
              <p className="text-xs text-muted-foreground">
                {delinquents.length > 0
                  ? "Requieren atención"
                  : "Sin morosos"}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/solicitudes">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">En cola hoy</CardTitle>
              <Anchor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendientes.length}</div>
              <p className="text-xs text-muted-foreground">
                Solicitud{pendientes.length !== 1 ? "es" : ""} pendiente
                {pendientes.length !== 1 ? "s" : ""} de embarcación
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Ship className="h-5 w-5" />
                Registro de embarcaciones hoy
              </CardTitle>
              <CardDescription>
                {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
              </CardDescription>
            </div>
            <Link
              href="/dashboard/solicitudes"
              className="text-sm text-primary hover:underline"
            >
              Ver todo
            </Link>
          </CardHeader>
          <CardContent>
            {registroHoy.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No hay movimientos registrados hoy.
              </p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {registroHoy.slice(0, 10).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0"
                  >
                    <span className="font-medium truncate max-w-[140px]">
                      {r.nombreCliente} / {r.nombreEmbarcacion}
                    </span>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {TIPO_LABEL[r.tipo] ?? r.tipo}
                      {r.operadorNombre ? ` · ${r.operadorNombre}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Resumen financiero
              </CardTitle>
              <CardDescription>
                {format(now, "MMMM yyyy", { locale: es })}
              </CardDescription>
            </div>
            <Link
              href="/dashboard/payments"
              className="text-sm text-primary hover:underline"
            >
              Ver pagos
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Ingresos (cobrado)</span>
                <span className="font-semibold text-green-600 dark:text-green-500">
                  +{formatCurrency(totalCobrado)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Gastos</span>
                <span className="font-semibold text-red-600 dark:text-red-500">
                  -{formatCurrency(totalGastos)}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm font-medium">Diferencia</span>
                <span
                  className={`font-bold ${
                    totalCobrado - totalGastos >= 0
                      ? "text-green-600 dark:text-green-500"
                      : "text-red-600 dark:text-red-500"
                  }`}
                >
                  {totalCobrado - totalGastos >= 0 ? "+" : ""}
                  {formatCurrency(totalCobrado - totalGastos)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
