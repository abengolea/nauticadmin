"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, Wallet, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ClientAccountEntry } from "@/lib/client-accounts/types";

const ENTRY_TYPE_LABELS: Record<string, string> = {
  invoice: "Factura / cargo",
  payment: "Cobro",
  monthly_fee: "Cuota mensual",
  credit_note: "Nota de crédito",
  debit_note: "Nota de débito",
  adjustment: "Ajuste",
};

interface PlayerAccountViewProps {
  getToken: () => Promise<string | null>;
}

export function PlayerAccountView({ getToken }: PlayerAccountViewProps) {
  const [entries, setEntries] = useState<ClientAccountEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [creditoActivo, setCreditoActivo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) {
      setError("Sesión expirada. Volvé a iniciar sesión.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/clients/accounts/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al cargar cuenta corriente");
        return;
      }
      setEntries(data.entries ?? []);
      setBalance(data.balance ?? 0);
      setCreditoActivo(data.creditoActivo !== false);
    } catch {
      setError("No se pudo conectar. Verificá tu conexión.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline">Mi cuenta corriente</h1>
        <p className="text-muted-foreground mt-1">
          Movimientos, cargos y cobros de tu cuenta
        </p>
      </div>

      {!creditoActivo && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Cuenta corriente deshabilitada</AlertTitle>
          <AlertDescription>
            Tu cuenta corriente no está activa. Consultá con la administración.
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5" />
            Saldo actual
          </CardTitle>
          <CardDescription>
            Saldo positivo = debés a la náutica · Saldo en cero = al día
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p
            className={`text-3xl font-bold ${
              balance > 0 ? "text-amber-700 dark:text-amber-400" : ""
            }`}
          >
            ARS {balance.toLocaleString("es-AR")}
          </p>
          {balance === 0 && (
            <Badge variant="secondary" className="mt-2">
              Al día
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos</CardTitle>
          <CardDescription>Debe = cargos · Haber = cobros recibidos</CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No hay movimientos registrados en tu cuenta corriente.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 rounded-md border">
              <table className="w-full text-sm min-w-[560px]">
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
                  {[...entries].reverse().map((e) => (
                    <tr key={e.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 whitespace-nowrap">
                        {format(new Date(e.date), "dd/MM/yyyy", { locale: es })}
                      </td>
                      <td className="p-3">{ENTRY_TYPE_LABELS[e.type] ?? e.type}</td>
                      <td className="p-3">{e.description}</td>
                      <td className="p-3 text-right">
                        {e.debit > 0 ? e.debit.toLocaleString("es-AR") : "—"}
                      </td>
                      <td className="p-3 text-right">
                        {e.credit > 0 ? e.credit.toLocaleString("es-AR") : "—"}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {(e.balanceAfter ?? 0).toLocaleString("es-AR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
