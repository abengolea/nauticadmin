"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Ship, Percent, Plus, Trash2 } from "lucide-react";
import { useFirestore, useUserProfile, useDoc } from "@/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import type { BoatPricingConfig, BoatPricingItem } from "@/lib/types/boat-pricing";
import { DEFAULT_BOAT_PRICING_ITEMS } from "@/lib/types/boat-pricing";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const CONFIG_DOC_ID = "default";

function AddItemForm({
  uniqueGroups,
  onAdd,
}: {
  uniqueGroups: string[];
  onAdd: (group: string, label: string, price: number) => void;
}) {
  const [group, setGroup] = useState("");
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState<number>(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(group.trim() || "Nueva categoría", label.trim() || "Nuevo tipo", price);
    setGroup("");
    setLabel("");
    setPrice(0);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label htmlFor="new-group">Categoría</Label>
        <Input
          id="new-group"
          list="groups-list"
          placeholder="Ej: Nave cubierta - Lanchas"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        />
        <datalist id="groups-list">
          {uniqueGroups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-label">Descripción</Label>
        <Input
          id="new-label"
          placeholder="Ej: Cat. N°1 (Hasta 4.80mts)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-price">Precio (IVA incl.)</Label>
        <Input
          id="new-price"
          type="number"
          min={0}
          step={1000}
          value={price || ""}
          onChange={(e) => setPrice(parseInt(e.target.value) || 0)}
        />
      </div>
      <DialogFooter>
        <Button type="submit">
          <Plus className="h-4 w-4 mr-2" />
          Agregar
        </Button>
      </DialogFooter>
    </form>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildDefaultItems(): BoatPricingItem[] {
  return DEFAULT_BOAT_PRICING_ITEMS.map((item, idx) => ({
    ...item,
    id: `${slugify(item.group)}-${slugify(item.label)}-${idx}`,
  }));
}

interface BoatPricingConfigFormProps {
  schoolId: string;
}

export function BoatPricingConfigForm({ schoolId }: BoatPricingConfigFormProps) {
  const firestore = useFirestore();
  const { user } = useUserProfile();
  const { toast } = useToast();
  const { data: config, loading } = useDoc<BoatPricingConfig & { id: string }>(
    `schools/${schoolId}/boatPricingConfig/${CONFIG_DOC_ID}`
  );

  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<BoatPricingItem[]>(() => buildDefaultItems());
  const [globalAdjustmentPercent, setGlobalAdjustmentPercent] = useState<number>(0);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  useEffect(() => {
    if (config) {
      setItems(config.items?.length ? config.items : buildDefaultItems());
      setGlobalAdjustmentPercent(config.globalAdjustmentPercent ?? 0);
    } else if (!loading) {
      setItems(buildDefaultItems());
    }
  }, [config, loading]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, BoatPricingItem[]>();
    for (const item of items) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const updateItemPrice = (id: string, price: number) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, price: Math.max(0, Math.round(price)) } : i))
    );
  };

  const updateItemLabel = (id: string, label: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, label } : i)));
  };

  const updateItemGroup = (id: string, group: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, group } : i)));
  };

  const addNewItem = (group?: string, label?: string, price?: number) => {
    const newItem: BoatPricingItem = {
      id: crypto.randomUUID(),
      group: group ?? "Nueva categoría",
      label: label ?? "Nuevo tipo",
      price: price ?? 0,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const uniqueGroups = useMemo(() => [...new Set(items.map((i) => i.group))].sort(), [items]);

  const applyGlobalAdjustment = () => {
    if (globalAdjustmentPercent === 0) return;
    const factor = 1 + globalAdjustmentPercent / 100;
    setItems((prev) =>
      prev.map((i) => ({ ...i, price: Math.round(i.price * factor) }))
    );
    toast({
      title: "Ajuste aplicado",
      description: `Se aplicó ${globalAdjustmentPercent > 0 ? "+" : ""}${globalAdjustmentPercent}% a todos los precios.`,
    });
  };

  const resetToDefaults = () => {
    setItems(buildDefaultItems());
    setGlobalAdjustmentPercent(0);
    toast({
      title: "Valores restaurados",
      description: "Se restauraron los precios por defecto.",
    });
  };

  const handleSave = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      const ref = doc(firestore, "schools", schoolId, "boatPricingConfig", CONFIG_DOC_ID);
      await setDoc(
        ref,
        {
          items,
          globalAdjustmentPercent: globalAdjustmentPercent || undefined,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );
      toast({
        title: "Precios guardados",
        description: "La configuración de tipos y precios se actualizó correctamente.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo guardar.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ship className="h-5 w-5" />
          Tipos de embarcaciones y precios
        </CardTitle>
        <CardDescription>
          Canon mensual por categoría (IVA incluido). Editá tipos y precios, agregá nuevos o eliminá los que no uses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2 min-w-[180px]">
            <Label htmlFor="global-percent">Ajuste global (%)</Label>
            <div className="flex gap-2">
              <Input
                id="global-percent"
                type="number"
                placeholder="0"
                value={globalAdjustmentPercent === 0 ? "" : globalAdjustmentPercent}
                onChange={(e) =>
                  setGlobalAdjustmentPercent(parseFloat(e.target.value) || 0)
                }
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Aplicar porcentaje a todos los precios"
                onClick={applyGlobalAdjustment}
              >
                <Percent className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button variant="outline" onClick={resetToDefaults}>
            Restaurar valores por defecto
          </Button>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoría</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right w-[140px]">Precio (IVA incl.)</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedItems.map(([group, groupItems]) =>
                groupItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-muted-foreground whitespace-nowrap p-1">
                      <Input
                        className="h-8 text-sm"
                        value={item.group}
                        onChange={(e) => updateItemGroup(item.id, e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        className="h-8"
                        value={item.label}
                        onChange={(e) => updateItemLabel(item.id, e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-right p-1">
                      <Input
                        type="number"
                        min={0}
                        step={1000}
                        className="text-right h-8 w-full max-w-[120px] ml-auto"
                        value={item.price || ""}
                        onChange={(e) =>
                          updateItemPrice(item.id, parseInt(e.target.value) || 0)
                        }
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteItem(item.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap gap-2">
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Agregar tipo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar nuevo tipo de embarcación</DialogTitle>
                <DialogDescription>
                  Ingresá la categoría, descripción y precio. Podés elegir una categoría existente o crear una nueva.
                </DialogDescription>
              </DialogHeader>
              <AddItemForm
                uniqueGroups={uniqueGroups}
                onAdd={(group, label, price) => {
                  addNewItem(group, label, price);
                  setAddDialogOpen(false);
                }}
              />
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={() => addNewItem()}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar fila rápida
          </Button>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Guardar precios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
