"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getMissingProfileFieldLabels } from "@/lib/utils";
import { useUser } from "@/firebase";
import { PlayerPhotoField } from "./PlayerPhotoField";
import { Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Player } from "@/lib/types";
import { getPlayerEmbarcaciones } from "@/lib/utils";
import { useDoc } from "@/firebase";
import type { BoatPricingConfig } from "@/lib/types/boat-pricing";
import { getDefaultBoatPricingItems, splitPricingItems } from "@/lib/types/boat-pricing";

const embarcacionSchema = z.object({
  id: z.string(),
  nombre: z.string().optional(),
  matricula: z.string().optional(),
  medidas: z.string().optional(),
  datos: z.string().optional(),
  claseId: z.string().optional(),
});

const servicioAdicionalSchema = z.object({
  id: z.string(),
  claseId: z.string(),
});

const playerSchema = z.object({
  // Datos personales
  firstName: z.string().min(1, "El nombre es requerido."),
  lastName: z.string().min(1, "El apellido es requerido."),
  dni: z.string().optional(),
  email: z.string().email("Debe ser un email válido.").optional().or(z.literal("")),
  tutorPhone: z.string().optional(),
  status: z.enum(["active", "inactive", "suspended"]),
  observations: z.string().optional(),
  photoUrl: z.string().url("Debe ser una URL válida.").optional().or(z.literal("")),
  // Datos náuticos - embarcaciones (una o más)
  embarcaciones: z.array(embarcacionSchema).default([]),
  serviciosAdicionales: z.array(servicioAdicionalSchema).default([]),
  ubicacion: z.string().optional(),
  clienteDesde: z.string().optional(),
  creditoActivo: z.boolean().optional(),
  requiereFactura: z.boolean().optional(),
  personasAutorizadas: z.string().optional(),
  usuarioId: z.string().optional(),
});

interface EditPlayerDialogProps {
  player: Player;
  schoolId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Si es true, el jugador edita su propio perfil: no puede cambiar el campo Estado. */
  isPlayerEditing?: boolean;
  /** Pestaña inicial al abrir (por defecto "personal"). */
  initialTab?: "personal" | "nautica";
}

export function EditPlayerDialog({
  player,
  schoolId,
  isOpen,
  onOpenChange,
  onSuccess,
  isPlayerEditing = false,
  initialTab = "personal",
}: EditPlayerDialogProps) {
  const { user } = useUser();
  const { toast } = useToast();

  const embarcacionesIniciales = getPlayerEmbarcaciones(player).map((e, i) => ({
    ...e,
    id: e.id === "legacy" ? `legacy-${i}` : e.id,
  }));

  const form = useForm<z.infer<typeof playerSchema>>({
    resolver: zodResolver(playerSchema),
    defaultValues: {
      firstName: player.firstName ?? "",
      lastName: player.lastName ?? "",
      dni: player.dni ?? "",
      email: player.email ?? "",
      tutorPhone: player.tutorContact?.phone ?? "",
      status: player.status ?? "active",
      observations: player.observations ?? "",
      photoUrl: player.photoUrl ?? "",
      embarcaciones: embarcacionesIniciales.length > 0 ? embarcacionesIniciales : [{ id: crypto.randomUUID(), nombre: "", matricula: "", medidas: "", datos: "", claseId: "" }],
      serviciosAdicionales: (player as { serviciosAdicionales?: { id: string; claseId: string }[] }).serviciosAdicionales ?? [],
      ubicacion: player.ubicacion ?? "",
      clienteDesde: player.clienteDesde ?? "",
      creditoActivo: player.creditoActivo ?? undefined,
      requiereFactura: player.requiereFactura !== false,
      personasAutorizadas: Array.isArray(player.personasAutorizadas) ? player.personasAutorizadas.join(", ") : (player.personasAutorizadas as string) ?? "",
      usuarioId: player.usuarioId ?? "",
    },
  });

  const [activeTab, setActiveTab] = useState<"personal" | "nautica">(initialTab);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "embarcaciones",
  });
  const {
    fields: servicioFields,
    append: appendServicio,
    remove: removeServicio,
  } = useFieldArray({
    control: form.control,
    name: "serviciosAdicionales",
  });

  const { data: boatPricing } = useDoc<BoatPricingConfig & { id: string }>(
    `schools/${schoolId}/boatPricingConfig/default`
  );
  const pricingItems =
    boatPricing?.items?.length ? boatPricing.items : getDefaultBoatPricingItems();
  const { embarcaciones: embarcacionItems, servicios: servicioItems } = splitPricingItems(pricingItems);

  // Reset form when player changes or dialog opens
  useEffect(() => {
    if (isOpen && player) {
      const emb = getPlayerEmbarcaciones(player).map((e, i) => ({
        ...e,
        id: e.id === "legacy" ? `legacy-${i}` : e.id,
      }));
      form.reset({
        firstName: player.firstName ?? "",
        lastName: player.lastName ?? "",
        dni: player.dni ?? "",
        email: player.email ?? "",
        tutorPhone: player.tutorContact?.phone ?? "",
        status: player.status ?? "active",
        observations: player.observations ?? "",
        photoUrl: player.photoUrl ?? "",
        embarcaciones: emb.length > 0 ? emb : [{ id: crypto.randomUUID(), nombre: "", matricula: "", medidas: "", datos: "", claseId: "" }],
        serviciosAdicionales: (player as { serviciosAdicionales?: { id: string; claseId: string }[] }).serviciosAdicionales ?? [],
        ubicacion: player.ubicacion ?? "",
        clienteDesde: player.clienteDesde ?? "",
        creditoActivo: player.creditoActivo ?? undefined,
        requiereFactura: player.requiereFactura !== false,
        personasAutorizadas: Array.isArray(player.personasAutorizadas) ? player.personasAutorizadas.join(", ") : (player.personasAutorizadas as string) ?? "",
        usuarioId: player.usuarioId ?? "",
      });
    }
  }, [isOpen, player, form]);

  const { isSubmitting } = form.formState;

  async function onSubmit(values: z.infer<typeof playerSchema>) {
    const personasArr = values.personasAutorizadas?.trim()
      ? values.personasAutorizadas.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const embarcaciones = values.embarcaciones
      ?.filter((e) => (e.claseId?.trim() || e.nombre?.trim() || e.matricula?.trim() || e.medidas?.trim()))
      .map((e) => ({
        id: e.id,
        nombre: e.nombre?.trim() || undefined,
        matricula: e.matricula?.trim() || undefined,
        medidas: e.medidas?.trim() || undefined,
        datos: e.datos?.trim() || undefined,
        claseId: e.claseId?.trim() || undefined,
      })) ?? [];

    const updateData: Record<string, unknown> = {
      firstName: values.firstName,
      lastName: values.lastName,
      dni: values.dni || null,
      email: values.email?.trim() ? values.email.trim().toLowerCase() : null,
      tutorContact: {
        name: `${values.firstName} ${values.lastName}`.trim() || "Sin datos",
        phone: values.tutorPhone ?? "",
      },
      status: values.status,
      photoUrl: values.photoUrl || null,
      observations: values.observations || null,
      embarcaciones: embarcaciones.length > 0 ? embarcaciones : null,
      serviciosAdicionales: (values.serviciosAdicionales ?? []).filter((s) => s.claseId?.trim()).length > 0
        ? (values.serviciosAdicionales ?? []).filter((s) => s.claseId?.trim()).map((s) => ({ id: s.id, claseId: s.claseId!.trim() }))
        : null,
      ubicacion: values.ubicacion?.trim() || null,
      clienteDesde: values.clienteDesde?.trim() || null,
      creditoActivo: values.creditoActivo ?? null,
      requiereFactura: values.requiereFactura ?? true,
      personasAutorizadas: personasArr ?? null,
      usuarioId: values.usuarioId?.trim() || null,
    };
    if (embarcaciones.length > 0) {
      updateData.embarcacionNombre = null;
      updateData.embarcacionMatricula = null;
      updateData.embarcacionMedidas = null;
      updateData.embarcacionDatos = null;
    }

    const showSuccess = () => {
      onOpenChange(false);
      onSuccess?.();
      if (isPlayerEditing) {
        const missing = getMissingProfileFieldLabels({
          firstName: values.firstName,
          lastName: values.lastName,
          tutorPhone: values.tutorPhone,
          email: values.email,
          photoUrl: values.photoUrl,
        });
        if (missing.length > 0) {
          toast({
            title: "Guardado correctamente",
            description: `Se guardaron tus datos. Completá: ${missing.join(", ")}.`,
          });
        } else {
          toast({
            title: "Perfil completo",
            description: "Todos los datos están guardados.",
          });
        }
      } else {
        toast({
          title: "Guardado correctamente",
          description: `Los datos de ${values.firstName} ${values.lastName} se guardaron correctamente.`,
        });
      }
    };

    // Siempre usar la API para actualizar (evita errores de permisos en reglas del cliente).
    if (!user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo verificar tu sesión. Volvé a iniciar sesión.",
      });
      return;
    }

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/players/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          playerId: player.id,
          oldEmail: player.email ?? null,
          updateData,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.detail || "Error al guardar");
      }
      showSuccess();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error al actualizar",
        description: err instanceof Error ? err.message : "No se pudieron guardar los cambios.",
      });
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) form.reset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] sm:max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Editar perfil del cliente</DialogTitle>
          <DialogDescription>
            <strong>Datos personales:</strong> nombre, apellido, DNI, contacto, teléfono (opcional), email (opcional), estado, foto, observaciones. <strong>Embarcación:</strong> nombre, matrícula, ubicación, etc.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "personal" | "nautica")} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <TabsList className="grid w-full grid-cols-2 mb-4 flex-shrink-0">
                <TabsTrigger value="personal">Datos personales</TabsTrigger>
                <TabsTrigger value="nautica">Embarcación</TabsTrigger>
              </TabsList>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-2 -mr-2">
              <TabsContent value="personal" className="mt-0 space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input placeholder="Lionel" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Apellido</FormLabel>
                        <FormControl>
                          <Input placeholder="Messi" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dni"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>DNI (Opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="40.123.456" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tutorPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono de contacto (Opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="+54 9 ..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email (Opcional)</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="cliente@ejemplo.com" {...field} />
                        </FormControl>
                        <FormDescription>Opcional. Si lo completas, el cliente podrá iniciar sesión y ver su perfil.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!isPlayerEditing && (
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un estado" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">Activo</SelectItem>
                            <SelectItem value="inactive">Inactivo</SelectItem>
                            <SelectItem value="suspended">Suspendido por mora</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  )}
                  <FormField
                    control={form.control}
                    name="photoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Foto de la embarcación</FormLabel>
                        <FormControl>
                          <PlayerPhotoField
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            schoolId={schoolId}
                            playerId={player.id}
                            playerName={`${player.firstName ?? ""} ${player.lastName ?? ""}`.trim()}
                          />
                        </FormControl>
                        <FormDescription>
                          Sacá una foto de la embarcación o subí una imagen desde tu dispositivo.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="observations"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Observaciones</FormLabel>
                        <FormControl>
                          <Input placeholder="Cualquier nota adicional..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
              <TabsContent value="nautica" className="mt-0 space-y-6">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Cargá cada embarcación con su clase (tipo) para que el sistema sepa cuánto cobrar.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ id: crypto.randomUUID(), nombre: "", matricula: "", medidas: "", datos: "", claseId: "" })}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar embarcación
                    </Button>
                  </div>
                  {fields.map((field, index) => (
                    <div key={field.id} className="rounded-lg border p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Embarcación {index + 1}</span>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`embarcaciones.${index}.claseId`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel>Clase (tipo de embarcación) *</FormLabel>
                              <Select onValueChange={f.onChange} value={f.value ?? ""}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar clase..." />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {embarcacionItems.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.group} – {item.label} (${(item.price ?? 0).toLocaleString("es-AR")})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>Define el canon mensual a cobrar.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`embarcaciones.${index}.nombre`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel>Nombre</FormLabel>
                              <FormControl>
                                <Input placeholder="Ej: Rey Cargo 620" {...f} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`embarcaciones.${index}.matricula`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel>Matrícula</FormLabel>
                              <FormControl>
                                <Input placeholder="Ej: 099223" {...f} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`embarcaciones.${index}.medidas`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel>Medidas</FormLabel>
                              <FormControl>
                                <Input placeholder="Ej: 6.20m x 2.50m" {...f} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`embarcaciones.${index}.datos`}
                          render={({ field: f }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Datos adicionales</FormLabel>
                              <FormControl>
                                <Input placeholder="Cualquier dato adicional..." {...f} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ))}
                  {servicioItems.length > 0 && (
                    <div className="rounded-lg border p-4 space-y-4 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          Servicios adicionales (lavado, marinería, kayaks, guarda bote auxiliar, etc.)
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => appendServicio({ id: crypto.randomUUID(), claseId: "" })}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Agregar servicio
                        </Button>
                      </div>
                      {servicioFields.map((field, index) => (
                        <div key={field.id} className="flex items-center gap-2">
                          <FormField
                            control={form.control}
                            name={`serviciosAdicionales.${index}.claseId`}
                            render={({ field: f }) => (
                              <FormItem className="flex-1">
                                <Select onValueChange={f.onChange} value={f.value ?? ""}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seleccionar servicio..." />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {servicioItems.map((item) => (
                                      <SelectItem key={item.id} value={item.id}>
                                        {item.group} – {item.label} (${(item.price ?? 0).toLocaleString("es-AR")})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive shrink-0"
                            onClick={() => removeServicio(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-6 pt-2 border-t">
                  <FormField
                    control={form.control}
                    name="ubicacion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ubicación (amarra, muelle)</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej: Muelle 3 - Amarra 15" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="clienteDesde"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cliente desde</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej: 2020-01" {...field} />
                        </FormControl>
                        <FormDescription>Fecha o período desde que es cliente.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!isPlayerEditing && (
                    <FormField
                      control={form.control}
                      name="usuarioId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Id Usuario (app de pagos)</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej: 14115606" {...field} />
                          </FormControl>
                          <FormDescription>ID del cliente en la app de pagos (para importar Excel).</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="requiereFactura"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Requiere factura</FormLabel>
                          <FormDescription>
                            Si está activo, se facturarán los pagos de este cliente. Desactivar si no necesita factura.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value ?? true}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="creditoActivo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Crédito activo</FormLabel>
                        <Select
                          onValueChange={(v) =>
                            field.onChange(v === "__none__" ? undefined : v === "true")
                          }
                          value={
                            field.value === undefined
                              ? "__none__"
                              : field.value
                                ? "true"
                                : "false"
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">No especificado</SelectItem>
                            <SelectItem value="true">Sí</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="personasAutorizadas"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Personas autorizadas</FormLabel>
                        <FormControl>
                          <Input placeholder="Nombres separados por coma" {...field} />
                        </FormControl>
                        <FormDescription>Personas autorizadas a manejar la embarcación.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </div>
                </div>
              </TabsContent>
            </div>
            </Tabs>

            <DialogFooter className="pt-6 mt-4 border-t flex-shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
