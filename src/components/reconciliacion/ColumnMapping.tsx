"use client";

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
import { newExtraField, unusedHeaders } from "@/lib/reconciliacion-excel/column-mapping";
import type { ColumnMapping, ColumnMappingCoreField } from "@/lib/reconciliacion-excel/types";
import { Plus, Trash2 } from "lucide-react";

const NONE_VALUE = "__none__";
const EMPTY_HEADER_VALUE = "__empty__";

const CORE_FIELDS: Array<{ field: ColumnMappingCoreField; label: string; required?: boolean }> = [
  { field: "payer", label: "Pagador", required: true },
  { field: "amount", label: "Monto", required: true },
  { field: "date", label: "Fecha (opcional)" },
  { field: "reference", label: "Referencia (opcional)" },
];

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
  const extras = mapping.extras ?? [];
  const unused = unusedHeaders(headers, { ...mapping, extras });

  const resolveValue = (column: string) =>
    column === "" ? NONE_VALUE : column || NONE_VALUE;

  const actualColumn = (value: string) =>
    value === NONE_VALUE || value === EMPTY_HEADER_VALUE ? "" : value;

  const handleCoreChange = (field: ColumnMappingCoreField, value: string) => {
    onChange({ ...mapping, [field]: actualColumn(value) });
  };

  const handleExtraColumn = (id: string, value: string) => {
    onChange({
      ...mapping,
      extras: extras.map((e) =>
        e.id === id ? { ...e, column: actualColumn(value) } : e
      ),
    });
  };

  const handleExtraLabel = (id: string, label: string) => {
    onChange({
      ...mapping,
      extras: extras.map((e) => (e.id === id ? { ...e, label } : e)),
    });
  };

  const handleAddExtra = (column = "", label = "") => {
    onChange({
      ...mapping,
      extras: [...extras, newExtraField(label || column, column)],
    });
  };

  const handleRemoveExtra = (id: string) => {
    onChange({
      ...mapping,
      extras: extras.filter((e) => e.id !== id),
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pagador y Monto son obligatorios. Agregá o sacá el resto; la IA puede generarlos y después los guardás con un nombre.
      </p>

      {CORE_FIELDS.map(({ field, label, required }) => (
        <div key={field} className="space-y-2">
          <Label>
            {label}
            {required ? " *" : ""}
          </Label>
          <Select
            value={resolveValue(mapping[field])}
            onValueChange={(v) => handleCoreChange(field, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar columna…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((h, i) => {
                const itemValue = h === "" ? EMPTY_HEADER_VALUE : h;
                return (
                  <SelectItem key={`${field}-${i}-${itemValue}`} value={itemValue}>
                    {h === NONE_VALUE ? "(ninguna)" : h === "" ? "(columna vacía)" : h}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      ))}

      {extras.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Campos extra</p>
          {extras.map((extra) => (
            <div key={extra.id} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="space-y-2 flex-1 min-w-0">
                <Label htmlFor={`extra-label-${extra.id}`}>Nombre del campo</Label>
                <Input
                  id={`extra-label-${extra.id}`}
                  value={extra.label}
                  placeholder="Ej. Comercio, CBU, Nro tarjeta"
                  onChange={(e) => handleExtraLabel(extra.id, e.target.value)}
                />
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                <Label>Columna del archivo</Label>
                <Select
                  value={resolveValue(extra.column)}
                  onValueChange={(v) => handleExtraColumn(extra.id, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar columna…" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((h, i) => {
                      const itemValue = h === "" ? EMPTY_HEADER_VALUE : h;
                      return (
                        <SelectItem key={`${extra.id}-${i}-${itemValue}`} value={itemValue}>
                          {h === NONE_VALUE ? "(ninguna)" : h === "" ? "(columna vacía)" : h}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => handleRemoveExtra(extra.id)}
                aria-label={`Quitar campo ${extra.label || "extra"}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => handleAddExtra()}>
          <Plus className="h-4 w-4 mr-1" />
          Agregar campo
        </Button>
        {unused.map((h) => (
          <Button
            key={h}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleAddExtra(h, h)}
          >
            <Plus className="h-3 w-3 mr-1" />
            {h}
          </Button>
        ))}
      </div>
    </div>
  );
}
