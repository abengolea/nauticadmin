"use client";

import { useState, useEffect } from "react";
import { useUserProfile } from "@/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { ReconciliationImport } from "@/components/reconciliation/ReconciliationImport";
import { ReconciliationReview } from "@/components/reconciliation/ReconciliationReview";

export default function ReconciliationPage() {
  const { profile, isReady, activeSchoolId } = useUserProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab") === "conciliacion" ? "conciliacion" : "importar";
  const [tab, setTab] = useState<"importar" | "conciliacion">(tabFromUrl);

  useEffect(() => {
    if (tabFromUrl === "conciliacion") setTab("conciliacion");
  }, [tabFromUrl]);

  if (!isReady) return null;
  const canAccess =
    profile?.role === "school_admin" && activeSchoolId;
  if (!canAccess) {
    router.replace("/dashboard");
    return null;
  }

  const schoolId = activeSchoolId!;
  const batchId = searchParams.get("batch");

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <h1 className="text-2xl font-bold tracking-tight font-headline sm:text-3xl">
        Conciliación de Pagos
      </h1>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "importar" | "conciliacion")} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="importar" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Importar
          </TabsTrigger>
          <TabsTrigger value="conciliacion" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Conciliación
          </TabsTrigger>
        </TabsList>
        <TabsContent value="importar">
          <ReconciliationImport schoolId={schoolId} />
        </TabsContent>
        <TabsContent value="conciliacion">
          <ReconciliationReview schoolId={schoolId} initialBatchId={batchId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
