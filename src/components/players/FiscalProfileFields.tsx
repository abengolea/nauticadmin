"use client";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CondicionIvaFormField } from "./CondicionIvaFormField";
import { condicionIvaRequiresCuit } from "@/lib/fiscal/receptor-doc";
import { CONDICION_IVA_RECEPTOR } from "@/lib/fiscal/constants";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useWatch } from "react-hook-form";

interface FiscalProfileFieldsProps<T extends FieldValues> {
  control: Control<T>;
  cuitName?: FieldPath<T>;
  condicionName?: FieldPath<T>;
  requiereFacturaName?: FieldPath<T>;
  /** Ocultar switch "requiere factura" (ej. vista cliente) */
  showRequiereFactura?: boolean;
}

export function FiscalProfileFields<T extends FieldValues>({
  control,
  cuitName = "cuit" as FieldPath<T>,
  condicionName = "condicionIVAId" as FieldPath<T>,
  requiereFacturaName = "requiereFactura" as FieldPath<T>,
  showRequiereFactura = true,
}: FiscalProfileFieldsProps<T>) {
  const condicionId = useWatch({ control, name: condicionName }) as number | undefined;
  const needsCuit = condicionIvaRequiresCuit(condicionId);
  const isRi = condicionId === CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO;

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4 md:col-span-2">
      <div>
        <h4 className="text-sm font-semibold">Datos fiscales (ARCA)</h4>
        <p className="text-xs text-muted-foreground mt-1">
          Necesarios para emitir factura electrónica. El CUIT del cliente debe ser distinto al CUIT de la náutica.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <CondicionIvaFormField control={control} name={condicionName} />

        <FormField
          control={control}
          name={cuitName}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                CUIT {needsCuit ? "(obligatorio)" : "(opcional)"}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={needsCuit ? "Ej: 20-25715970-2" : "Solo si facturás con CUIT"}
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormDescription>
                {needsCuit
                  ? isRi
                    ? "Responsable Inscripto: se emite Factura A con este CUIT."
                    : "Esta condición IVA exige CUIT válido en ARCA."
                  : "Consumidor final: alcanza con DNI. CUIT solo si el cliente lo tiene."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {showRequiereFactura && (
        <FormField
          control={control}
          name={requiereFacturaName}
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border bg-background p-4">
              <div className="space-y-0.5">
                <FormLabel>Requiere factura</FormLabel>
                <FormDescription>
                  Si está activo, los cobros aprobados de este cliente pueden facturarse contra ARCA.
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      )}
    </div>
  );
}
