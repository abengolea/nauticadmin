"use client";

import type { School } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatCuitDisplay(cuit: string): string {
  const d = cuit.replace(/\D/g, "");
  if (d.length !== 11) return cuit;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}
import { FileText, AlertTriangle } from "lucide-react";

interface SchoolFacturacionTabProps {
  school: School;
}

export function SchoolFacturacionTab({ school }: SchoolFacturacionTabProps) {
  const f = school.facturacion;

  if (!f?.cuit || !f?.razonSocial) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Facturación no configurada
          </CardTitle>
          <CardDescription>
            Contactá al administrador para cargar los datos fiscales de la náutica.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rows: { label: string; value: string }[] = [
    { label: "Razón social", value: f.razonSocial },
    { label: "CUIT", value: formatCuitDisplay(f.cuit) },
    { label: "Condición IVA", value: f.condicionIVA ?? "—" },
    { label: "Domicilio", value: f.domicilio ?? "—" },
    { label: "Ingresos brutos", value: f.ingBrutos ?? "—" },
    { label: "Inicio actividades", value: f.inicioActividades ?? "—" },
    { label: "Punto de venta AFIP", value: String(f.ptoVta ?? "—") },
    { label: "Tipo comprobante", value: f.cbteTipo === 11 ? "Factura C" : "Factura B" },
    { label: "Email", value: f.email ?? "—" },
    { label: "Teléfono", value: f.telefono ?? "—" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Datos fiscales (emisor)
        </CardTitle>
        <CardDescription>
          Las facturas se emiten a nombre de esta empresa. Notificas SRL opera la app usando
          sus certificados AFIP y la delegación configurada en ARCA.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          {rows.map(({ label, value }) => (
            <div key={label} className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {f.modeloFacturaUrl && (
          <p className="mt-4 text-sm text-muted-foreground">
            Plantilla PDF cargada. Los comprobantes usan el diseño de la náutica al emitir desde Cobros.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
