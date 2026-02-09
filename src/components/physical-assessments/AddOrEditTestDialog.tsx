"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { PhysicalAgeGroup } from "@/lib/types";
import type { FieldDef, FieldCategory } from "@/lib/physical-assessments";

const CATEGORIES: { value: FieldCategory; label: string }[] = [
  { value: "velocidad", label: "Velocidad" },
  { value: "fuerza", label: "Fuerza" },
  { value: "resistencia", label: "Resistencia" },
  { value: "coordinacion", label: "Coordinación" },
  { value: "agilidad", label: "Agilidad" },
  { value: "flexibilidad", label: "Flexibilidad" },
  { value: "observacion", label: "Observación" },
];

const schema = z.object({
  label: z.string().min(1, "El nombre del test es requerido"),
  unit: z.string().optional(),
  type: z.enum(["number", "text"]),
  min: z.union([z.number(), z.string()]).optional().transform((v) => {
    if (v === "" || v === undefined) return undefined;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return isNaN(n) ? undefined : n;
  }),
  max: z.union([z.number(), z.string()]).optional().transform((v) => {
    if (v === "" || v === undefined) return undefined;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return isNaN(n) ? undefined : n;
  }),
  placeholder: z.string().optional(),
  category: z.enum([
    "velocidad", "fuerza", "resistencia", "coordinacion", "agilidad", "flexibilidad", "observacion"
  ] as const).optional(),
});

type FormValues = z.infer<typeof schema>;

export interface AddOrEditTestDialogProps {
  ageGroup: PhysicalAgeGroup;
  /** En modo editar: el campo a editar (base o custom). En modo agregar: undefined. */
  editingField?: FieldDef | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    key: string;
    label: string;
    unit?: string;
    type: "number" | "text";
    min?: number;
    max?: number;
    placeholder?: string;
    category?: FieldCategory;
    isCustom: boolean;
  }) => void;
}

export function AddOrEditTestDialog({
  ageGroup,
  editingField,
  isOpen,
  onOpenChange,
  onSave,
}: AddOrEditTestDialogProps) {
  const isEditMode = Boolean(editingField?.key);
  const isCustomField = editingField?.key?.startsWith("custom_") ?? false;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      label: "",
      unit: "",
      type: "number",
      min: undefined,
      max: undefined,
      placeholder: "",
      category: "velocidad",
    },
  });

  useEffect(() => {
    if (isOpen && editingField) {
      form.reset({
        label: editingField.label,
        unit: editingField.unit ?? "",
        type: editingField.type,
        min: editingField.min,
        max: editingField.max,
        placeholder: editingField.placeholder ?? "",
        category: editingField.category ?? "velocidad",
      });
    } else if (isOpen && !editingField) {
      form.reset({
        label: "",
        unit: "",
        type: "number",
        min: undefined,
        max: undefined,
        placeholder: "",
        category: "velocidad",
      });
    }
  }, [isOpen, editingField, form]);

  function onSubmit(values: FormValues) {
    const key = isEditMode ? editingField!.key : `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    onSave({
      key,
      label: values.label,
      unit: values.unit || undefined,
      type: values.type,
      min: values.type === "number" ? values.min : undefined,
      max: values.type === "number" ? values.max : undefined,
      placeholder: values.placeholder || undefined,
      category: values.category,
      isCustom: !isEditMode || isCustomField,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Editar test" : "Agregar test"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Modifica las propiedades del test para el grupo " + ageGroup + " años."
              : "Define un nuevo test personalizado para el grupo " + ageGroup + " años."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del test</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Sprint 20 m" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidad (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: s, cm, m, rep" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="number">Número</SelectItem>
                      <SelectItem value="text">Texto / Observación</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.watch("type") === "number" && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="min"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mínimo (opcional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Ej: 1"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="max"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Máximo (opcional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Ej: 120"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            <FormField
              control={form.control}
              name="placeholder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Placeholder (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: 5.2" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? "velocidad"}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isEditMode ? "Guardar cambios" : "Agregar test"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
