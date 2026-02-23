"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirige a la página unificada de conciliación */
export default function ReconciliacionExcelRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/reconciliation?tab=excel");
  }, [router]);
  return null;
}
