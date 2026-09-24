"use client";

import { Mail, Landmark, Copy, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export type TransferInfo = {
  cbu?: string;
  alias?: string;
  bankName?: string;
  notifyEmail?: string;
};

interface TransferPaymentInstructionsProps {
  transferInfo: TransferInfo;
  amount?: number;
  currency?: string;
  periodLabel?: string;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: "Copiado", description: `${label} copiado al portapapeles.` });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: "destructive", title: "No se pudo copiar" });
    }
  };

  return (
    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopy}>
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

export function TransferPaymentInstructions({
  transferInfo,
  amount,
  currency = "ARS",
  periodLabel,
}: TransferPaymentInstructionsProps) {
  const { cbu, alias, bankName, notifyEmail } = transferInfo;
  const hasBankData = Boolean(cbu?.trim() || alias?.trim());

  if (!hasBankData && !notifyEmail?.trim()) {
    return (
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            Pago por transferencia
          </CardTitle>
          <CardDescription>
            Los pagos online no están disponibles. Contactá a la administración de tu náutica para
            obtener los datos bancarios e informar tu transferencia.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const mailSubject = encodeURIComponent(
    periodLabel ? `Comprobante de transferencia - ${periodLabel}` : "Comprobante de transferencia"
  );
  const mailBody = encodeURIComponent(
    [
      "Hola,",
      "",
      "Adjunto comprobante de transferencia.",
      periodLabel ? `Concepto: ${periodLabel}` : "",
      amount != null && amount > 0 ? `Monto: ${currency} ${amount.toLocaleString("es-AR")}` : "",
      "",
      "Saludos.",
    ]
      .filter(Boolean)
      .join("\n")
  );
  const mailtoHref = notifyEmail?.trim()
    ? `mailto:${notifyEmail.trim()}?subject=${mailSubject}&body=${mailBody}`
    : undefined;

  return (
    <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Landmark className="h-5 w-5" />
          Pagá por transferencia bancaria
        </CardTitle>
        <CardDescription>
          Realizá la transferencia y enviá el comprobante por email para que la administración registre tu pago.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {amount != null && amount > 0 && (
          <p className="text-sm">
            Monto a transferir:{" "}
            <strong>
              {currency} {amount.toLocaleString("es-AR")}
            </strong>
            {periodLabel ? <> ({periodLabel})</> : null}
          </p>
        )}

        {bankName?.trim() && (
          <p className="text-sm text-muted-foreground">Banco: {bankName.trim()}</p>
        )}

        {cbu?.trim() && (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-background p-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">CBU</p>
              <p className="font-mono text-sm break-all">{cbu.trim()}</p>
            </div>
            <CopyButton value={cbu.trim()} label="CBU" />
          </div>
        )}

        {alias?.trim() && (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-background p-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Alias</p>
              <p className="font-mono text-sm break-all">{alias.trim()}</p>
            </div>
            <CopyButton value={alias.trim()} label="Alias" />
          </div>
        )}

        {notifyEmail?.trim() && (
          <div className="space-y-2">
            <p className="text-sm">
              Una vez transferido, enviá el comprobante a:{" "}
              <strong>{notifyEmail.trim()}</strong>
            </p>
            {mailtoHref && (
              <Button asChild variant="outline" className="gap-2">
                <a href={mailtoHref}>
                  <Mail className="h-4 w-4" />
                  Informar transferencia por email
                </a>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
