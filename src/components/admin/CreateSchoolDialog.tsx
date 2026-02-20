"use client";

import { useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, PlusCircle, UserPlus } from "lucide-react";
import { useUserProfile } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "../ui/separator";

const schoolSchema = z
  .object({
    name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
    city: z.string().min(2, "La ciudad es requerida."),
    province: z.string().min(2, "La provincia es requerida."),
    address: z.string().optional(),
    adminDisplayName: z.string().min(3, "El nombre del administrador es requerido."),
    adminEmail: z.string().email("El correo electrónico no es válido."),
    adminEmailConfirm: z.string().email("El correo electrónico no es válido."),
    adminPassword: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
  })
  .refine((data) => data.adminEmail === data.adminEmailConfirm, {
    message: "Los correos electrónicos no coinciden.",
    path: ["adminEmailConfirm"],
  });

export function CreateSchoolDialog() {
  const [open, setOpen] = useState(false);
  const { user } = useUserProfile();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof schoolSchema>>({
    resolver: zodResolver(schoolSchema),
    defaultValues: {
      name: "",
      city: "",
      province: "",
      address: "",
      adminDisplayName: "",
      adminEmail: "",
      adminEmailConfirm: "",
      adminPassword: "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: z.infer<typeof schoolSchema>) {
    const token = await user?.getIdToken?.().catch(() => null);
    if (!token) {
      toast({
        variant: "destructive",
        title: "Error de sesión",
        description: "No se pudo verificar tu sesión. Cierra sesión y vuelve a entrar.",
      });
      return;
    }

    try {
      const res = await fetch("/api/admin/create-school", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: values.name,
          city: values.city,
          province: values.province,
          address: values.address || undefined,
          adminDisplayName: values.adminDisplayName,
          adminEmail: values.adminEmail,
          adminPassword: values.adminPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Error",
          description: data.error || "No se pudo crear la náutica.",
          duration: 8000,
        });
        return;
      }

      toast({
        title: "¡Éxito!",
        description: data.message || `Se creó la náutica "${values.name}" y se asignó a ${values.adminEmail} como administrador.`,
      });
      form.reset();
      setOpen(false);
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error("[CreateSchoolDialog] Error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "Error de conexión. Revisa tu internet e inténtalo de nuevo.",
        duration: 8000,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Crear Nueva Náutica
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Nueva Náutica</DialogTitle>
          <DialogDescription>
            Completa los datos para registrar una nueva náutica y su administrador.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
            <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Datos de la Náutica</h3>
                <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Nombre de la Náutica</FormLabel>
                    <FormControl>
                        <Input placeholder="Ej: Club Náutico San Isidro" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="province"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Provincia</FormLabel>
                    <FormControl>
                        <Input placeholder="Córdoba" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Ciudad</FormLabel>
                    <FormControl>
                        <Input placeholder="Córdoba Capital" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Dirección (Opcional)</FormLabel>
                    <FormControl>
                        <Input placeholder="Av. Siempre Viva 742" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>

            <Separator />
            
            <div className="space-y-2">
                 <h3 className="font-semibold text-foreground flex items-center gap-2"><UserPlus className="h-5 w-5" /> Datos del Administrador</h3>
                 <FormField
                    control={form.control}
                    name="adminDisplayName"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Nombre y Apellido del Admin</FormLabel>
                        <FormControl>
                            <Input placeholder="Marcelo Gallardo" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="adminEmail"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Email del Admin</FormLabel>
                        <FormControl>
                            <Input type="email" placeholder="mg@riverplate.com" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="adminEmailConfirm"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Confirmar Email del Admin</FormLabel>
                        <FormControl>
                            <Input type="email" placeholder="mg@riverplate.com" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="adminPassword"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Contraseña Inicial</FormLabel>
                        <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                         <p className="text-xs text-muted-foreground pt-1">Mínimo 6 caracteres. El administrador podrá cambiarla luego.</p>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "Creando..." : "Crear Escuela y Admin"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
