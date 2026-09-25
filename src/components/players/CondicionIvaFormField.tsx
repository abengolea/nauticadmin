"use client";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONDICION_IVA_RECEPTOR } from "@/lib/fiscal/constants";
import { CONDICION_IVA_UI_OPTIONS } from "@/lib/fiscal/iva-receptor";
import type { Control, FieldPath, FieldValues } from "react-hook-form";

interface CondicionIvaFormFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
}

export function CondicionIvaFormField<T extends FieldValues>({
  control,
  name,
}: CondicionIvaFormFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Condición frente al IVA (ARCA)</FormLabel>
          <Select
            onValueChange={(v) => field.onChange(parseInt(v, 10))}
            value={String(field.value ?? CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL)}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {CONDICION_IVA_UI_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} value={String(opt.id)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormDescription>
            Código enviado a ARCA en la solicitud de CAE (RG 5616).
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
