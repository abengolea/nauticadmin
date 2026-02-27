"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useAuth, useFirestore, useStorage, useUserProfile } from "@/firebase";
import { collection, doc, writeBatch, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { sendPasswordResetEmail } from "firebase/auth";
import { initializeApp, deleteApp } from "firebase/app";
import { getFirebaseConfig } from "@/firebase/config";
import { PlayerPhotoField } from "./PlayerPhotoField";
import { uploadPlayerPhoto } from "@/lib/player-photo";
import { updateDoc } from "firebase/firestore";
import { useDoc } from "@/firebase";
import type { BoatPricingConfig } from "@/lib/types/boat-pricing";
import { getDefaultBoatPricingItems, splitPricingItems } from "@/lib/types/boat-pricing";

function generateRandomPassword(length = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const embarcacionSchema = z.object({
  id: z.string(),
  nombre: z.string().optional(),
  matricula: z.string().optional(),
  medidas: z.string().optional(),
  lona: z.string().optional(),
  datos: z.string().optional(),
  claseId: z.string().optional(),
});

const servicioAdicionalSchema = z.object({
  id: z.string(),
  claseId: z.string(),
});

const playerSchema = z.object({
  firstName: z.string().min(1, "El nombre es requerido."),
  lastName: z.string().min(1, "El apellido es requerido."),
  dni: z.string().optional(),
  email: z.string().email("Debe ser un email válido.").optional().or(z.literal("")),
  initialPassword: z
    .string()
    .optional()
    .transform((v) => v ?? "")
    .refine((v) => v.length === 0 || v.length >= 6, "Mínimo 6 caracteres."),
  tutorPhone: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  observations: z.string().optional(),
  photoUrl: z.string().optional().or(z.literal("")),
  // Datos de embarcaciones
  embarcaciones: z.array(embarcacionSchema).default([]),
  serviciosAdicionales: z.array(servicioAdicionalSchema).default([]),
  ubicacion: z.string().optional(),
  clienteDesde: z.string().optional(),
  creditoActivo: z.boolean().optional(),
  requiereFactura: z.boolean().optional(),
  personasAutorizadas: z.string().optional(),
  usuarioId: z.string().optional(),
  cuit: z.string().optional(),
  condicionIVA: z.string().optional(),
  documentacion: z.string().url("Debe ser una URL válida.").optional().or(z.literal("")),
});

export function AddPlayerForm() {
    const firestore = useFirestore();
    const storage = useStorage();
    const mainAuth = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const { profile, activeSchoolId } = useUserProfile();

    const form = useForm<z.infer<typeof playerSchema>>({
        resolver: zodResolver(playerSchema),
        defaultValues: {
            firstName: "",
            lastName: "",
            email: "",
            initialPassword: "",
            tutorPhone: "",
            status: "active",
            photoUrl: "",
            observations: "",
            dni: "",
            embarcaciones: [{ id: crypto.randomUUID(), nombre: "", matricula: "", medidas: "", lona: "", datos: "", claseId: "" }],
            serviciosAdicionales: [],
            ubicacion: "",
            clienteDesde: "",
            creditoActivo: undefined,
            requiereFactura: true,
            personasAutorizadas: "",
            usuarioId: "",
            cuit: "",
            condicionIVA: "Consumidor Final",
            documentacion: "",
        },
    });

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
        activeSchoolId ? `schools/${activeSchoolId}/boatPricingConfig/default` : ""
    );
    const pricingItems =
        boatPricing?.items?.length ? boatPricing.items : getDefaultBoatPricingItems();
    const { embarcaciones: embarcacionItems, servicios: servicioItems } = splitPricingItems(pricingItems);

    const hasEmail = !!form.watch("email")?.trim();
    const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);

    async function onSubmit(values: z.infer<typeof playerSchema>) {
        if (!profile || !activeSchoolId) {
            toast({
                variant: "destructive",
                title: "Error de Perfil",
                description: "Tu perfil de usuario no está asociado a una escuela. No puedes añadir jugadores.",
            });
            return;
        }

        const emailNorm = values.email?.trim().toLowerCase();
        const wantsLogin = !!emailNorm;
        const adminSetsPassword = wantsLogin && !!values.initialPassword?.trim();
        const sendSetPasswordEmail = wantsLogin && !adminSetsPassword;

        let authUserCreated = false;
        const tempAppName = `temp-player-creation-${Date.now()}`;
        const tempApp = initializeApp(getFirebaseConfig(), tempAppName);
        const tempAuth = getAuth(tempApp);

        try {
            if (wantsLogin) {
                const password = adminSetsPassword
                    ? values.initialPassword!.trim()
                    : generateRandomPassword();
                await createUserWithEmailAndPassword(tempAuth, emailNorm, password);
                authUserCreated = true;
            }

            const personasArr = values.personasAutorizadas?.trim()
                ? values.personasAutorizadas.split(",").map((s) => s.trim()).filter(Boolean)
                : undefined;

            const embarcaciones = values.embarcaciones
                ?.filter((e) => (e.claseId?.trim() || e.nombre?.trim() || e.matricula?.trim() || e.medidas?.trim() || e.lona?.trim()))
                .map((e) => ({
                    id: e.id,
                    nombre: e.nombre?.trim() || undefined,
                    matricula: e.matricula?.trim() || undefined,
                    medidas: e.medidas?.trim() || undefined,
                    lona: e.lona?.trim() || undefined,
                    datos: e.datos?.trim() || undefined,
                    claseId: e.claseId?.trim() || undefined,
                })) ?? [];

            const serviciosAdicionales = (values.serviciosAdicionales ?? [])
                .filter((s) => s.claseId?.trim())
                .map((s) => ({ id: s.id, claseId: s.claseId!.trim() }));

            const playerData = {
                firstName: values.firstName,
                lastName: values.lastName,
                dni: values.dni,
                ...(emailNorm && { email: emailNorm }),
                tutorContact: {
                    name: `${values.firstName} ${values.lastName}`.trim() || "Sin datos",
                    phone: values.tutorPhone ?? "",
                },
                status: values.status,
                photoUrl: values.photoUrl,
                observations: values.observations,
                createdAt: Timestamp.now(),
                createdBy: profile.uid,
                ...(embarcaciones.length > 0 && { embarcaciones }),
                ...(serviciosAdicionales.length > 0 && { serviciosAdicionales }),
                ...(values.ubicacion?.trim() && { ubicacion: values.ubicacion.trim() }),
                ...(values.clienteDesde?.trim() && { clienteDesde: values.clienteDesde.trim() }),
                ...(values.creditoActivo !== undefined && { creditoActivo: values.creditoActivo }),
                ...(values.requiereFactura !== undefined && { requiereFactura: values.requiereFactura }),
                ...(personasArr && personasArr.length > 0 && { personasAutorizadas: personasArr }),
                ...(values.usuarioId?.trim() && { usuarioId: values.usuarioId.trim() }),
                ...(values.cuit?.trim() && { cuit: values.cuit.trim() }),
                ...(values.condicionIVA?.trim() && { condicionIVA: values.condicionIVA.trim() }),
                ...(values.documentacion?.trim() && { documentacion: values.documentacion.trim() }),
            };

            const playersCollectionRef = collection(firestore, `schools/${activeSchoolId}/players`);
            const newPlayerRef = doc(playersCollectionRef);
            const batch = writeBatch(firestore);
            batch.set(newPlayerRef, playerData);

            if (emailNorm) {
                batch.set(doc(firestore, "playerLogins", emailNorm), {
                    schoolId: activeSchoolId,
                    playerId: newPlayerRef.id,
                });
            }

            await batch.commit();

            if (pendingPhotoFile) {
                try {
                    const photoUrl = await uploadPlayerPhoto(storage, activeSchoolId, newPlayerRef.id, pendingPhotoFile);
                    await updateDoc(newPlayerRef, { photoUrl });
                } catch (photoErr) {
                    toast({
                        variant: "destructive",
                        title: "Jugador creado",
                        description: `Se creó el cliente pero no se pudo subir la foto: ${photoErr instanceof Error ? photoErr.message : "Error desconocido"}`,
                    });
                }
            }

            if (sendSetPasswordEmail) {
                try {
                    await sendPasswordResetEmail(mainAuth, emailNorm);
                    toast({
                        title: "Jugador añadido",
                        description: `Se creó la cuenta y se envió un correo a ${emailNorm} para que el jugador cree su contraseña.`,
                        duration: 8000,
                    });
                } catch (emailErr) {
                    toast({
                        title: "Jugador añadido",
                        variant: "destructive",
                        description: `Cuenta creada, pero no se pudo enviar el correo para crear contraseña. El jugador puede usar "¿Olvidaste tu contraseña?" en el login.`,
                        duration: 10000,
                    });
                }
            } else if (adminSetsPassword) {
                const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/auth/login` : "";
                toast({
                    title: "Jugador añadido",
                    description: `Comunicale la contraseña al jugador por un canal seguro. Puede iniciar sesión en ${loginUrl}`,
                    duration: 10000,
                });
            } else {
                toast({
                    title: "Jugador añadido",
                    description: `${values.firstName} ${values.lastName} ha sido añadido a la base de datos.`,
                });
            }

            router.push("/dashboard/players");
        } catch (err: unknown) {
            const code = (err as { code?: string })?.code;
            if (code === "auth/email-already-in-use") {
                toast({
                    variant: "destructive",
                    title: "Email en uso",
                    description: "Ese correo ya tiene una cuenta. Si debe acceder como jugador, usá otro email o que use «¿Olvidaste tu contraseña?» en el login.",
                    duration: 8000,
                });
                return;
            }
            if (code === "auth/weak-password") {
                toast({
                    variant: "destructive",
                    title: "Contraseña débil",
                    description: "La contraseña debe tener al menos 6 caracteres.",
                });
                return;
            }
            errorEmitter.emit(
                "permission-error",
                new FirestorePermissionError({
                    path: `schools/${activeSchoolId}/players`,
                    operation: "create",
                })
            );
            toast({
                variant: "destructive",
                title: "Error",
                description: authUserCreated
                    ? "No se pudo guardar el jugador. Revisá en Firebase Auth si se creó un usuario con ese email y eliminarlo si hace falta."
                    : "No se pudo añadir al jugador. Revisá permisos o intentá de nuevo.",
            });
        } finally {
            await deleteApp(tempApp);
        }
    }

    return (
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid md:grid-cols-2 gap-8">
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
                    name="email"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Email (acceso al panel)</FormLabel>
                        <FormControl>
                        <Input type="email" placeholder="jugador@ejemplo.com" {...field} />
                        </FormControl>
                        <FormDescription>Opcional. Si lo completas, podés crearle la cuenta para que entre al panel (con contraseña que vos definís o por correo para que la cree).</FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                {hasEmail && (
                  <FormField
                    control={form.control}
                    name="initialPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña inicial (opcional)</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Mín. 6 caracteres" {...field} autoComplete="new-password" />
                        </FormControl>
                        <FormDescription>
                          Si la dejás en blanco, le enviaremos un correo al jugador para que cree su propia contraseña.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
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
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecciona un estado" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="active">Activo</SelectItem>
                                <SelectItem value="inactive">Inactivo</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="photoUrl"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Foto de la embarcación (Opcional)</FormLabel>
                        <FormControl>
                        <PlayerPhotoField
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            schoolId={activeSchoolId ?? ""}
                            onFileChange={setPendingPhotoFile}
                            playerName={`${form.watch("firstName") ?? ""} ${form.watch("lastName") ?? ""}`.trim()}
                        />
                        </FormControl>
                        <FormDescription>Sacá una foto de la embarcación o subí una imagen desde tu dispositivo.</FormDescription>
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

            {/* Datos de embarcaciones */}
            <div className="space-y-6 pt-4 border-t">
                <h3 className="text-lg font-semibold">Datos de embarcaciones</h3>
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Cargá cada embarcación con su clase (tipo) para que el sistema sepa cuánto cobrar.
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => append({ id: crypto.randomUUID(), nombre: "", matricula: "", medidas: "", lona: "", datos: "", claseId: "" })}
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
                                        <FormLabel>Clase (tipo de embarcación)</FormLabel>
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
                                name={`embarcaciones.${index}.lona`}
                                render={({ field: f }) => (
                                    <FormItem>
                                        <FormLabel>Lona</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ej: Sí / No / Tipo" {...f} />
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
                    <FormField
                        control={form.control}
                        name="cuit"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>CUIT (facturación electrónica)</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ej: 20-12345678-9" {...field} />
                                </FormControl>
                                <FormDescription>CUIT del cliente para facturación AFIP.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="condicionIVA"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Condición frente al IVA</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value ?? "Consumidor Final"}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="Responsable Inscripto">Responsable Inscripto</SelectItem>
                                        <SelectItem value="Consumidor Final">Consumidor Final</SelectItem>
                                        <SelectItem value="Monotributista">Monotributista</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormDescription>Define el tipo de factura a emitir (AFIP).</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="requiereFactura"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 md:col-span-2">
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
                    <FormField
                        control={form.control}
                        name="documentacion"
                        render={({ field }) => (
                            <FormItem className="md:col-span-2">
                                <FormLabel>Documentación</FormLabel>
                                <FormControl>
                                    <Input
                                        type="url"
                                        placeholder="https://drive.google.com/..."
                                        {...field}
                                    />
                                </FormControl>
                                <FormDescription>Link a carpeta o archivo en Google Drive con la documentación del cliente.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </div>

            <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.formState.isSubmitting ? "Guardando..." : "Añadir Cliente"}
            </Button>
        </form>
        </Form>
    );
}
