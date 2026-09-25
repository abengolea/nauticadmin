"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCollection } from "@/firebase";
import { Anchor, Ship, FileWarning, TrendingUp, TrendingDown, Minus } from "lucide-react";
import Link from "next/link";
import type { Berth, Vessel, LogbookEntry } from "@/lib/types";
import { getExpiringDocs } from "@/lib/types/marina";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  schoolId: string;
  /** Pagos aprobados del mes actual */
  currentMonthTotal: number;
  /** Pagos aprobados del mismo mes año anterior */
  prevYearTotal: number;
  currency?: string;
}

function formatCurrency(amount: number, currency = "ARS") {
  return `${currency} ${amount.toLocaleString("es-AR")}`;
}

function OccupancyBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export function MarinaDashboardSection({ schoolId, currentMonthTotal, prevYearTotal, currency = "ARS" }: Props) {
  const { data: berths } = useCollection<Berth>(
    schoolId ? `schools/${schoolId}/berths` : ""
  );
  const { data: vessels } = useCollection<Vessel>(
    schoolId ? `schools/${schoolId}/vessels` : ""
  );
  const { data: logbook } = useCollection<LogbookEntry>(
    schoolId ? `schools/${schoolId}/logbook` : "",
    { where: ["status", "==", "out"] }
  );

  const berthStats = useMemo(() => {
    const list = berths ?? [];
    const total = list.length;
    const occupied = list.filter((b) => b.status === "occupied").length;
    const available = list.filter((b) => b.status === "available").length;
    const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
    return { total, occupied, available, pct };
  }, [berths]);

  const expiringDocs = useMemo(() => {
    return (vessels ?? []).flatMap((v) =>
      getExpiringDocs(v).map((d) => ({ vessel: v, doc: d }))
    );
  }, [vessels]);

  const afuera = logbook ?? [];

  const yoyDiff = prevYearTotal > 0 ? Math.round(((currentMonthTotal - prevYearTotal) / prevYearTotal) * 100) : null;

  const now = new Date();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Marina</h2>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Ocupación de amarras */}
        <Link href="/dashboard/amarras">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Amarras ocupadas</CardTitle>
              <Anchor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {berthStats.occupied}
                <span className="text-sm font-normal text-muted-foreground ml-1">/ {berthStats.total}</span>
              </div>
              <p className="text-xs text-muted-foreground">{berthStats.pct}% de ocupación</p>
              {berthStats.total > 0 && <OccupancyBar pct={berthStats.pct} />}
            </CardContent>
          </Card>
        </Link>

        {/* Embarcaciones afuera */}
        <Link href="/dashboard/bitacora">
          <Card className={`hover:bg-muted/50 transition-colors cursor-pointer h-full ${afuera.length > 0 ? "border-blue-400/50" : ""}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Embarcaciones afuera</CardTitle>
              <Ship className={`h-4 w-4 ${afuera.length > 0 ? "text-blue-500" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${afuera.length > 0 ? "text-blue-600 dark:text-blue-400" : ""}`}>
                {afuera.length}
              </div>
              <p className="text-xs text-muted-foreground">
                {afuera.length === 0
                  ? "Todas en base"
                  : afuera.length === 1
                  ? "1 embarcación navegando"
                  : `${afuera.length} embarcaciones navegando`}
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Docs por vencer */}
        <Link href="/dashboard/embarcaciones">
          <Card className={`hover:bg-muted/50 transition-colors cursor-pointer h-full ${expiringDocs.length > 0 ? "border-amber-400/50" : ""}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Docs por vencer</CardTitle>
              <FileWarning className={`h-4 w-4 ${expiringDocs.length > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${expiringDocs.length > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                {expiringDocs.length}
              </div>
              <p className="text-xs text-muted-foreground">
                {expiringDocs.length === 0 ? "Todo en orden" : "Requieren atención"}
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Recaudación vs año anterior */}
        <Link href="/dashboard/payments">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                vs {format(new Date(now.getFullYear() - 1, now.getMonth(), 1), "MMM yyyy", { locale: es })}
              </CardTitle>
              {yoyDiff === null ? (
                <Minus className="h-4 w-4 text-muted-foreground" />
              ) : yoyDiff >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(currentMonthTotal, currency)}</div>
              <p className="text-xs text-muted-foreground">
                {yoyDiff === null ? (
                  "Sin datos del año anterior"
                ) : (
                  <span className={yoyDiff >= 0 ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"}>
                    {yoyDiff >= 0 ? "+" : ""}{yoyDiff}% vs mismo mes año anterior
                  </span>
                )}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Embarcaciones actualmente afuera */}
      {afuera.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Ship className="h-4 w-4 text-blue-500" />
                Actualmente navegando
              </CardTitle>
              <CardDescription>Embarcaciones fuera de base ahora</CardDescription>
            </div>
            <Link href="/dashboard/bitacora" className="text-sm text-primary hover:underline">
              Ver bitácora
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {afuera.slice(0, 8).map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                  <span className="font-medium">{e.vesselName}</span>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <span>{e.playerName}</span>
                    {e.destino && <Badge variant="outline" className="text-xs">{e.destino}</Badge>}
                    <span>{format(e.departureAt instanceof Date ? e.departureAt : new Date(e.departureAt), "HH:mm")}</span>
                  </div>
                </li>
              ))}
              {afuera.length > 8 && (
                <li className="text-xs text-muted-foreground pt-1">y {afuera.length - 8} más...</li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Docs por vencer detalle */}
      {expiringDocs.length > 0 && (
        <Card className="border-amber-400/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
              <FileWarning className="h-4 w-4" />
              Documentación por vencer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {expiringDocs.slice(0, 6).map((item, i) => {
                const exp = new Date(item.doc.expiresAt!);
                const expired = exp < new Date();
                return (
                  <li key={i} className="flex items-center justify-between text-sm py-0.5">
                    <span>{item.vessel.nombre} — {item.doc.type === "seguro" ? "Seguro" : "Prefectura"}</span>
                    <Badge variant={expired ? "destructive" : "secondary"} className="text-xs">
                      {format(exp, "dd/MM/yyyy")}
                    </Badge>
                  </li>
                );
              })}
              {expiringDocs.length > 6 && (
                <li className="text-xs text-muted-foreground">y {expiringDocs.length - 6} más...</li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
