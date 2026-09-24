"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CONCEPTOS_PREDEFINIDOS = [
  "Lavado de lancha",
  "Venta de insumos",
  "Mantenimiento embarcación",
  "Guardería adicional",
  "Uso de grúa",
  "Otro",
] as const;

const MONTHS: { value: string; label: string }[] = [
  { value: "01", label: "Enero" },
  { value: "02", label: "Febrero" },
  { value: "03", label: "Marzo" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Mayo" },
  { value: "06", label: "Junio" },
  { value: "07", label: "Julio" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

function currentPeriod() {
  return `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
}

function getYears(): number[] {
  const current = new Date().getFullYear();
  const start = current - 1;
  const end = current + 1;
  const years: number[] = [];
  for (let y = end; y >= start; y--) {
    years.push(y);
  }
  return years;
}

interface AddServiceChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string;
  playerName?: string;
  schoolId: string;
  getToken: () => Promise<string | null>;
  onSuccess?: () => void;
}

export function AddServiceChargeDialog({
  open,
  onOpenChange,
  playerId,
  playerName,
  schoolId,
  getToken,
  onSuccess,
}: AddServiceChargeDialogProps) {
  const [conceptPreset, setConceptPreset] = useState<string>("");
  const [conceptCustom, setConceptCustom] = useState("");
  const [amount, setAmount] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const concept =
    conceptPreset === "Otro" ? conceptCustom.trim() : conceptPreset;
  const period = `${year}-${month}`;

  const handleSubmit = async () => {
    const amountNum = parseFloat(amount.replace(",", "."));
    if (!concept) {
      toast({
        variant: "destructive",
        title: "Completá el concepto",
        description: "Seleccioná o ingresá la actividad realizada.",
      });
      return;
    }
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      toast({
        variant: "destructive",
        title: "Monto inválido",
        description: "Ingresá un monto mayor a cero.",
      });
      return;
    }

    setSubmitting(true);
    const token = await getToken();
    if (!token) {
      toast({ variant: "destructive", title: "No se pudo obtener sesión." });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/payments/service-charge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          playerId,
          schoolId,
          concept,
          amount: amountNum,
          currency: "ARS",
          period,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Error al cargar el concepto");
      }

      toast({
        title: "Concepto cargado",
        description: data.emailSent
          ? `Se registró "${concept}" y se envió un email a ${playerName ?? "el cliente"}.`
          : `Se registró "${concept}". ${!data.emailSent ? "El cliente no tiene email asociado." : ""}`,
      });

      onSuccess?.();
      onOpenChange(false);
      setConceptPreset("");
      setConceptCustom("");
      setAmount("");
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo cargar el concepto",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setConceptPreset("");
      setConceptCustom("");
      setAmount("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Agregar servicio facturado
          </DialogTitle>
          <DialogDescription>
            {playerName
              ? `Cargar concepto para ${playerName}. Se enviará un email al cliente con la actividad realizada.`
              : "Cargar concepto esporádico (ej: Lavado de lancha, venta de insumos). Se enviará un email al cliente."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Concepto / Actividad realizada</Label>
            <Select value={conceptPreset} onValueChange={setConceptPreset}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar o escribir otro" />
              </SelectTrigger>
              <SelectContent>
                {CONCEPTOS_PREDEFINIDOS.filter((c) => c !== "Otro").map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
                <SelectItem value="Otro">Otro (especificar abajo)</SelectItem>
              </SelectContent>
            </Select>
            {conceptPreset === "Otro" && (
              <Input
                placeholder="Ej: Reparación de motor"
                value={conceptCustom}
                onChange={(e) => setConceptCustom(e.target.value)}
                maxLength={200}
                className="mt-2"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Monto (ARS)</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="Ej: 15000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Mes a facturar</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Año</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getYears().map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cargar y enviar email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
