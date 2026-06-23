"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { useUserProfile } from "@/firebase";

interface FeeStatus {
  isBonified: boolean;
  inDebt: boolean;
  totalDebt?: number;
  unpaid?: { period: string; daysOverdue: number; amount: number; lateFee: number }[];
  showWarning: boolean;
  riskSuspension: boolean;
  message: string;
}

export function SchoolFeeBanner() {
  const { user, profile, isSuperAdmin } = useUserProfile();
  const [status, setStatus] = useState<FeeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  const activeSchoolId = profile?.activeSchoolId;
  const canSeeBanner = !isSuperAdmin && profile?.role === "school_admin" && activeSchoolId;

  const fetchStatus = useCallback(async () => {
    if (!user || !activeSchoolId) return;
    const token = await user.getIdToken().catch(() => null);
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/platform-fee/my-status?schoolId=${activeSchoolId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [user, activeSchoolId]);

  useEffect(() => {
    if (canSeeBanner) fetchStatus();
    else setStatus(null);
  }, [canSeeBanner, fetchStatus]);

  const handlePay = async () => {
    if (!user || !activeSchoolId || !status?.unpaid?.length) return;
    const first = status.unpaid[0];
    const token = await user.getIdToken().catch(() => null);
    if (!token) return;
    setPaying(true);
    try {
      const res = await fetch("/api/platform-fee/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schoolId: activeSchoolId, period: first.period }),
      });
      const data = await res.json();
      if (res.ok && data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank");
      } else {
        throw new Error(data.error || "No se pudo generar el link");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPaying(false);
    }
  };

  if (!canSeeBanner || loading || !status) return null;
  if (status.isBonified || !status.inDebt) return null;

  return (
    <Alert variant={status.riskSuspension ? "destructive" : "default"} className="mx-2 sm:mx-4 mb-4 md:mx-8 md:mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Mensualidad pendiente</AlertTitle>
      <AlertDescription>
        <span className="block mb-2">{status.message}</span>
        <div className="flex flex-wrap gap-2 mt-2 flex-col sm:flex-row sm:items-center">
          {status.unpaid && status.unpaid.length > 0 && (
            <Button
              size="sm"
              variant={status.riskSuspension ? "destructive" : "secondary"}
              onClick={handlePay}
              disabled={paying}
            >
              {paying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
              Pagar ahora
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/payments?tab=mensualidad">Ver detalles</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
