"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatFacturaLabel } from "@/lib/factura-filename";

interface FacturaDownloadButtonProps {
  paymentId: string;
  schoolId: string;
  getToken: () => Promise<string | null>;
  facturaTipo?: string | null;
  facturaPtoVta?: number | null;
  facturaNumero?: number | null;
  hasPdf?: boolean;
}

export function FacturaDownloadButton({
  paymentId,
  schoolId,
  getToken,
  facturaTipo,
  facturaPtoVta,
  facturaNumero,
  hasPdf,
}: FacturaDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const label = formatFacturaLabel({ facturaTipo, facturaPtoVta, facturaNumero });

  const handleDownload = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        toast({ variant: "destructive", title: "No se pudo obtener sesión." });
        return;
      }
      const res = await fetch(
        `/api/payments/${paymentId}/factura-url?schoolId=${encodeURIComponent(schoolId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo abrir la factura");
      }
      if (!data.url) {
        throw new Error("La factura no tiene PDF disponible");
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({
        variant: "destructive",
        title: e instanceof Error ? e.message : "Error al descargar factura",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!hasPdf) {
    return (
      <span className="text-xs text-muted-foreground" title="Facturada, pero el PDF no quedó guardado">
        {label}
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs gap-1"
      onClick={handleDownload}
      disabled={loading}
      title={`Descargar ${label}`}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline max-w-[110px] truncate">{label}</span>
    </Button>
  );
}
