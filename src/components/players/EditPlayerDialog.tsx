"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { Loader2 } from "lucide-react";
import { getMissingProfileFieldLabels } from "@/lib/utils";
import { useUser } from "@/firebase";
import { PlayerPhotoField } from "./PlayerPhotoField";
import { Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Player } from "@/lib/types";

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
  // Datos náuticos
  embarcacionNombre: z.string().optional(),
  embarcacionMatricula: z.string().optional(),
  embarcacionMedidas: z.string().optional(),
  ubicacion: z.string().optional(),
  clienteDesde: z.string().optional(),
  creditoActivo: z.boolean().optional(),
  personasAutorizadas: z.string().optional(), // Coma-separado
  embarcacionDatos: z.string().optional(),
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
}

export function EditPlayerDialog({
  player,
  schoolId,
  isOpen,
  onOpenChange,
  onSuccess,
  isPlayerEditing = false,
}: EditPlayerDialogProps) {
  const { user } = useUser();
  const { toast } = useToast();

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
      embarcacionNombre: player.embarcacionNombre ?? "",
      embarcacionMatricula: player.embarcacionMatricula ?? "",
      embarcacionMedidas: player.embarcacionMedidas ?? "",
      ubicacion: player.ubicacion ?? "",
      clienteDesde: player.clienteDesde ?? "",
      creditoActivo: player.creditoActivo ?? undefined,
      personasAutorizadas: Array.isArray(player.personasAutorizadas) ? player.personasAutorizadas.join(", ") : (player.personasAutorizadas as string) ?? "",
      embarcacionDatos: player.embarcacionDatos ?? "",
      usuarioId: player.usuarioId ?? "",
    },
  });

  // Reset form when player changes or dialog opens
  useEffect(() => {
    if (isOpen && player) {
      form.reset({
        firstName: player.firstName ?? "",
        lastName: player.lastName ?? "",
        dni: player.dni ?? "",
        email: player.email ?? "",
        tutorPhone: player.tutorContact?.phone ?? "",
        status: player.status ?? "active",
        observations: player.observations ?? "",
        photoUrl: player.photoUrl ?? "",
        embarcacionNombre: player.embarcacionNombre ?? "",
        embarcacionMatricula: player.embarcacionMatricula ?? "",
        embarcacionMedidas: player.embarcacionMedidas ?? "",
        ubicacion: player.ubicacion ?? "",
        clienteDesde: player.clienteDesde ?? "",
        creditoActivo: player.creditoActivo ?? undefined,
        personasAutorizadas: Array.isArray(player.personasAutorizadas) ? player.personasAutorizadas.join(", ") : (player.personasAutorizadas as string) ?? "",
        embarcacionDatos: player.embarcacionDatos ?? "",
        usuarioId: player.usuarioId ?? "",
      });
    }
  }, [isOpen, player, form]);

  const { isSubmitting } = form.formState;

  async function onSubmit(values: z.infer<typeof playerSchema>) {
    const personasArr = values.personasAutorizadas?.trim()
      ? values.personasAutorizadas.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const updateData = {
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
      embarcacionNombre: values.embarcacionNombre?.trim() || null,
      embarcacionMatricula: values.embarcacionMatricula?.trim() || null,
      embarcacionMedidas: values.embarcacionMedidas?.trim() || null,
      ubicacion: values.ubicacion?.trim() || null,
      clienteDesde: values.clienteDesde?.trim() || null,
      creditoActivo: values.creditoActivo ?? null,
      personasAutorizadas: personasArr ?? null,
      embarcacionDatos: values.embarcacionDatos?.trim() || null,
      usuarioId: values.usuarioId?.trim() || null,
    };

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
            <Tabs defaultValue="personal" className="flex-1 flex flex-col min-h-0 overflow-hidden">
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
                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="embarcacionNombre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre de la embarcación</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej: Rey Cargo 620" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="embarcacionMatricula"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Matrícula</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej: 099223" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="embarcacionMedidas"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Medidas</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej: 6.20m x 2.50m" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                  <FormField
                    control={form.control}
                    name="embarcacionDatos"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Datos adicionales de la embarcación</FormLabel>
                        <FormControl>
                          <Input placeholder="Cualquier dato adicional..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
