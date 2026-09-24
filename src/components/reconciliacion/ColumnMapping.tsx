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
import { isRendicionDa, newExtraField, unusedHeaders } from "@/lib/reconciliacion-excel/column-mapping";
import type { ColumnMapping, ColumnMappingCoreField } from "@/lib/reconciliacion-excel/types";
import { Plus, Trash2 } from "lucide-react";

const NONE_VALUE = "__none__";
const EMPTY_HEADER_VALUE = "__empty__";

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
  const extras = mapping.extras ?? [];
  const unused = unusedHeaders(headers, { ...mapping, extras });

  if (isRendicionDa(headers)) {
    return (
      <RendicionDaColumns
        headers={headers}
        unused={unused}
        extras={extras}
        mapping={mapping}
        onChange={onChange}
      />
    );
  }

  return (
    <GenericColumnMapping
      headers={headers}
      mapping={mapping}
      extras={extras}
      unused={unused}
      onChange={onChange}
    />
  );
}

function RendicionDaColumns({
  headers,
  unused,
  extras,
  mapping,
  onChange,
}: {
  headers: string[];
  unused: string[];
  extras: ColumnMapping["extras"];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}) {
  const defaultExtraIds = new Set(["cardNumber", "applied"]);
  const addedExtras = extras.filter((e) => !defaultExtraIds.has(e.id));

  const handleAdd = (column = "", label = "") => {
    onChange({
      ...mapping,
      extras: [...extras, newExtraField(label || column, column)],
    });
  };

  const handleRemove = (id: string) => {
    onChange({
      ...mapping,
      extras: extras.filter((e) => e.id !== id),
    });
  };

  const handleExtraLabel = (id: string, label: string) => {
    onChange({
      ...mapping,
      extras: extras.map((e) => (e.id === id ? { ...e, label } : e)),
    });
  };

  const handleExtraColumn = (id: string, column: string) => {
    onChange({
      ...mapping,
      extras: extras.map((e) => (e.id === id ? { ...e, column } : e)),
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Columnas del archivo</p>
      <ul className="text-sm rounded-md border divide-y">
        {headers.filter((h) => h.trim()).map((h) => (
          <li key={h} className="px-3 py-2">
            {h}
          </li>
        ))}
      </ul>

      {addedExtras.length > 0 && (
        <div className="space-y-2">
          {addedExtras.map((extra) => (
            <div key={extra.id} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="space-y-1 flex-1 min-w-0">
                <Label htmlFor={`extra-label-${extra.id}`}>Campo</Label>
                <Input
                  id={`extra-label-${extra.id}`}
                  value={extra.label}
                  onChange={(e) => handleExtraLabel(extra.id, e.target.value)}
                />
              </div>
              <div className="space-y-1 flex-1 min-w-0">
                <Label>Columna</Label>
                <Select
                  value={extra.column || NONE_VALUE}
                  onValueChange={(v) => handleExtraColumn(extra.id, v === NONE_VALUE ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Columna…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>(ninguna)</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h || EMPTY_HEADER_VALUE}>
                        {h || "(vacía)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(extra.id)}
                aria-label="Quitar campo"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => handleAdd()}>
          <Plus className="h-4 w-4 mr-1" />
          Agregar campo
        </Button>
        {unused.map((h) => (
          <Button key={h} type="button" variant="secondary" size="sm" onClick={() => handleAdd(h, h)}>
            <Plus className="h-3 w-3 mr-1" />
            {h}
          </Button>
        ))}
      </div>
    </div>
  );
}

function GenericColumnMapping({
  headers,
  mapping,
  extras,
  unused,
  onChange,
}: {
  headers: string[];
  mapping: ColumnMapping;
  extras: ColumnMapping["extras"];
  unused: string[];
  onChange: (mapping: ColumnMapping) => void;
}) {
  const options = [NONE_VALUE, ...headers];
  const actualColumn = (value: string) =>
    value === NONE_VALUE || value === EMPTY_HEADER_VALUE ? "" : value;

  const handleCoreChange = (field: ColumnMappingCoreField, value: string) => {
    onChange({ ...mapping, extras, [field]: actualColumn(value) });
  };

  const fields: Array<{ field: ColumnMappingCoreField; label: string; required?: boolean }> = [
    { field: "lastName", label: "Apellido" },
    { field: "firstName", label: "Nombre" },
    { field: "payer", label: "Pagador" },
    { field: "amount", label: "Importe", required: true },
    { field: "reference", label: "Observaciones" },
  ];

  return (
    <div className="space-y-4">
      {fields.map(({ field, label, required }) => (
        <div key={field} className="space-y-2">
          <Label>
            {label}
            {required ? " *" : ""}
          </Label>
          <Select
            value={mapping[field] ? mapping[field]! : NONE_VALUE}
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
                    {h === NONE_VALUE ? "(ninguna)" : h || "(columna vacía)"}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({ ...mapping, extras: [...extras, newExtraField()] })
          }
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar campo
        </Button>
        {unused.map((h) => (
          <Button
            key={h}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({ ...mapping, extras: [...extras, newExtraField(h, h)] })
            }
          >
            <Plus className="h-3 w-3 mr-1" />
            {h}
          </Button>
        ))}
      </div>
    </div>
  );
}
