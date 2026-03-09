"use client";

import { useUserProfile, useFirebase } from "@/firebase";
import { getAuth } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentsTab } from "@/components/payments/PaymentsTab";
import { DelinquentsTab } from "@/components/payments/DelinquentsTab";
import { ChequesCobrosPendientesAlert } from "@/components/payments/ChequesCobrosPendientesAlert";
import { PagosPendientesVerificacionAlert } from "@/components/payments/PagosPendientesVerificacionAlert";
import { UnappliedTab } from "@/components/payments/UnappliedTab";
import { PaymentsSummaryCard } from "@/components/payments/PaymentsSummaryCard";
import { PaymentConfigTab } from "@/components/payments/PaymentConfigTab";
import { PlayerPaymentsView } from "@/components/payments/PlayerPaymentsView";
import { SchoolAdminMensualidadView } from "@/components/payments/SchoolAdminMensualidadView";
import { SchoolSwitcher, useSelectedSchool } from "@/components/layout/SchoolSwitcher";
import { useDoc } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import type { School } from "@/lib/types";
import { Banknote, AlertTriangle, Settings, Building2, FileX, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentsPage() {
  const { profile, isReady, isAdmin, isPlayer } = useUserProfile();
  const { selectedSchoolId, setSelectedSchoolId } = useSelectedSchool(profile);
  const router = useRouter();
  const { app } = useFirebase();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const schoolId = selectedSchoolId ?? profile?.activeSchoolId;
  const { data: school } = useDoc<School>(schoolId ? `schools/${schoolId}` : "");
  const tabFromUrl = searchParams.get("tab");
  const paymentResult = searchParams.get("payment");
  const schoolFeeResult = searchParams.get("schoolFee");
  const defaultTab = useMemo(() => {
    if (tabFromUrl === "config" || tabFromUrl === "delinquents" || tabFromUrl === "unapplied" || tabFromUrl === "mensualidad" || tabFromUrl === "duplicates") return tabFromUrl;
    return "payments";
  }, [tabFromUrl]);

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    if (defaultTab === "duplicates" && schoolId) {
      window.location.href = `/dashboard/payments/duplicates?schoolId=${schoolId}`;
      return;
    }
    setActiveTab(defaultTab);
  }, [defaultTab, schoolId]);

  const onTabChange = (value: string) => {
    if (value === "duplicates") {
      window.location.href = `/dashboard/payments/duplicates?schoolId=${schoolId}`;
      return;
    }
    setActiveTab(value);
    const url = new URL(window.location.href);
    if (value === "payments") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.replaceState({}, "", url.pathname + url.search);
  };

  const isMensualidadTab = activeTab === "mensualidad";

  useEffect(() => {
    if (!paymentResult) return;
    const messages: Record<string, { title: string; description: string; variant?: "default" | "destructive" }> = {
      success: { title: "Pago aprobado", description: "Tu pago fue acreditado. La cuota quedará registrada en unos instantes." },
      pending: { title: "Pago pendiente", description: "Tu pago está en proceso. Te avisaremos cuando se acredite." },
      failure: { title: "Pago no realizado", description: "El pago no se completó. Podés intentar de nuevo cuando quieras.", variant: "destructive" },
    };
    const msg = messages[paymentResult];
    if (msg) {
      toast({ ...msg });
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [paymentResult, toast]);

  useEffect(() => {
    if (!schoolFeeResult) return;
    const messages: Record<string, { title: string; description: string; variant?: "default" | "destructive" }> = {
      success: { title: "Mensualidad pagada", description: "El pago fue acreditado. La mensualidad quedará registrada en unos instantes." },
      pending: { title: "Pago en proceso", description: "Tu pago está en proceso. Te avisaremos cuando se acredite." },
      failure: { title: "Pago no realizado", description: "El pago no se completó. Podés intentar de nuevo cuando quieras.", variant: "destructive" },
    };
    const msg = messages[schoolFeeResult];
    if (msg) {
      toast({ ...msg });
      const clearUrl = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete("schoolFee");
        url.searchParams.set("tab", "mensualidad");
        window.history.replaceState({}, "", url.pathname + url.search);
      };
      setTimeout(clearUrl, 3000);
    }
  }, [schoolFeeResult, toast]);

  const getToken = useCallback(async () => {
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  }, [app]);

  useEffect(() => {
    if (!isReady) return;
    if (!profile) {
      router.push("/auth/pending-approval");
      return;
    }
    if (!isAdmin && !isPlayer) {
      router.push("/dashboard");
      return;
    }
  }, [isReady, profile, isAdmin, isPlayer, router]);

  if (!isReady || !profile) {
    return <div className="p-8">Cargando…</div>;
  }

  if (isPlayer) {
    return (
      <div className="p-4 md:p-6">
        <PlayerPaymentsView getToken={getToken} />
      </div>
    );
  }

  if (!schoolId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cobros</CardTitle>
          <CardDescription>Seleccioná una náutica para gestionar cobros de clientes</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 flex flex-col gap-2">
          {profile && schoolId && (
            <SchoolSwitcher
              profile={profile}
              value={schoolId}
              onChange={setSelectedSchoolId}
              className="sm:self-start"
            />
          )}
          <div>
            {isMensualidadTab ? (
              <>
                <h1 className="text-2xl font-bold tracking-tight font-headline sm:text-3xl flex items-center gap-2">
                  <Building2 className="h-6 w-6 sm:h-7 sm:w-7" />
                  Mensualidad a la plataforma
                </h1>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Cuota mensual que tu NAUTICA le paga a Notificas SRL
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight font-headline sm:text-3xl">Cobros</h1>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Cobros de clientes, cuotas ingresadas y morosos
                </p>
              </>
            )}
          </div>
        </div>
        {!isMensualidadTab && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              onClick={() => setManualOpen(true)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Banknote className="mr-2 h-4 w-4" />
              Registrar cobro manual
            </Button>
          </div>
        )}
      </div>

      {isMensualidadTab ? (
        <SchoolAdminMensualidadView schoolId={schoolId} getToken={getToken} refreshTrigger={schoolFeeResult} />
      ) : (
        <>
        <ChequesCobrosPendientesAlert schoolId={schoolId} getToken={getToken} onUpdated={() => { /* refresh handled by tab */ }} />
        <PagosPendientesVerificacionAlert schoolId={schoolId} getToken={getToken} onUpdated={() => { /* refresh handled by tab */ }} />
        <PaymentsSummaryCard schoolId={schoolId} getToken={getToken} refreshTrigger={paymentResult ?? schoolFeeResult} />
        <Tabs value={activeTab} onValueChange={onTabChange} key={tabFromUrl ?? "payments"}>
          <TabsList className="w-full grid grid-cols-5 gap-1 p-1 h-auto md:h-10 bg-card">
            <TabsTrigger value="payments" className="text-xs px-2 py-2 gap-1 md:text-sm md:px-3 md:py-1.5 md:gap-2">
              <Banknote className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Cobros ingresados</span>
              <span className="sm:hidden truncate">Cobros</span>
            </TabsTrigger>
            <TabsTrigger value="duplicates" className="text-xs px-2 py-2 gap-1 md:text-sm md:px-3 md:py-1.5 md:gap-2">
              <Copy className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Duplicados</span>
              <span className="sm:hidden truncate">Dupl.</span>
            </TabsTrigger>
            <TabsTrigger value="unapplied" className="text-xs px-2 py-2 gap-1 md:text-sm md:px-3 md:py-1.5 md:gap-2">
              <FileX className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Cobros rechazados</span>
              <span className="sm:hidden truncate">Rechaz.</span>
            </TabsTrigger>
            <TabsTrigger value="delinquents" className="text-xs px-2 py-2 gap-1 md:text-sm md:px-3 md:py-1.5 md:gap-2">
              <AlertTriangle className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
              <span className="truncate">Morosos</span>
            </TabsTrigger>
            <TabsTrigger value="config" className="text-xs px-2 py-2 gap-1 md:text-sm md:px-3 md:py-1.5 md:gap-2">
              <Settings className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Configuración</span>
              <span className="sm:hidden truncate">Config</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="payments" forceMount className="data-[state=inactive]:hidden">
            <PaymentsTab
              schoolId={schoolId}
              getToken={getToken}
              manualOpen={manualOpen}
              onManualOpenChange={setManualOpen}
              facturacionRazonSocial={school?.facturacion?.razonSocial}
              gestionarNauticaHref={schoolId ? `/dashboard/schools/${schoolId}` : undefined}
            />
          </TabsContent>
          <TabsContent value="unapplied">
            <UnappliedTab schoolId={schoolId} getToken={getToken} />
          </TabsContent>
          <TabsContent value="delinquents">
            <DelinquentsTab schoolId={schoolId} getToken={getToken} />
          </TabsContent>
          <TabsContent value="config">
            <PaymentConfigTab schoolId={schoolId} getToken={getToken} />
          </TabsContent>
        </Tabs>
        </>
      )}
    </div>
  );
}
