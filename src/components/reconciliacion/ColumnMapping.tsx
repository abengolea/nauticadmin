"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnMapping } from "@/lib/reconciliacion-excel/types";

const NONE_VALUE = "__none__";

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  payer: "Pagador",
  amount: "Monto",
  date: "Fecha",
  reference: "Referencia (opcional)",
};

type ColumnMappingProps = {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
};

export function ColumnMappingComponent({
  headers,
  mapping,
  onChange,
}: ColumnMappingProps) {
  const options = [NONE_VALUE, ...headers];

  const handleChange = (field: keyof ColumnMapping, value: string) => {
    onChange({ ...mapping, [field]: value === NONE_VALUE ? "" : value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paso 3: Mapeo de columnas</CardTitle>
        <CardDescription>
          Asigná cada campo del archivo de pagos a la columna correspondiente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(Object.keys(FIELD_LABELS) as Array<keyof ColumnMapping>).map((field) => (
          <div key={field} className="space-y-2">
            <Label>{FIELD_LABELS[field]}</Label>
            <Select
              value={mapping[field] || NONE_VALUE}
              onValueChange={(v) => handleChange(field, v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar columna…" />
              </SelectTrigger>
              <SelectContent>
                {options.map((h, i) => (
                  <SelectItem key={`${i}-${h}`} value={h}>
                    {h === NONE_VALUE ? "(ninguna)" : h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
