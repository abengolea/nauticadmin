"use client";

import { useState, useEffect, useCallback } from "react";
import { Banknote, FileX, AlertTriangle } from "lucide-react";

type Summary = {
  collected: { count: number; total: number };
  unapplied: { count: number; total: number };
  delinquents: { count: number; total: number };
};

interface PaymentsSummaryCardProps {
  schoolId: string;
  getToken: () => Promise<string | null>;
  refreshTrigger?: string | null;
}

export function PaymentsSummaryCard({ schoolId, getToken, refreshTrigger }: PaymentsSummaryCardProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/payments/summary?schoolId=${schoolId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [schoolId, getToken]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, refreshTrigger]);

  if (loading) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-4 animate-pulse">
            <div className="h-4 bg-muted rounded w-24 mb-2" />
            <div className="h-8 bg-muted rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Banknote className="h-4 w-4" />
          <span className="text-sm font-medium">Cobrados</span>
        </div>
        <p className="text-2xl font-bold mt-1">{summary.collected.count}</p>
        <p className="text-sm text-muted-foreground">
          ARS {summary.collected.total.toLocaleString("es-AR")}
        </p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileX className="h-4 w-4" />
          <span className="text-sm font-medium">No aplicados</span>
        </div>
        <p className="text-2xl font-bold mt-1">{summary.unapplied.count}</p>
        <p className="text-sm text-muted-foreground">
          ARS {summary.unapplied.total.toLocaleString("es-AR")}
        </p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Morosos</span>
        </div>
        <p className="text-2xl font-bold mt-1">{summary.delinquents.count}</p>
        <p className="text-sm text-muted-foreground">
          ARS {summary.delinquents.total.toLocaleString("es-AR")}
        </p>
      </div>
    </div>
  );
}
