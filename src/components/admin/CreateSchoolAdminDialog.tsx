"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, UserPlus } from "lucide-react";
import { useUserProfile } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import type { School } from "@/lib/types";

function generatePassword(length = 12): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const createAdminSchema = z
  .object({
    schoolId: z.string().min(1, "Seleccioná una náutica."),
    displayName: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
    email: z.string().email("El correo electrónico no es válido."),
    emailConfirm: z.string().email("El correo electrónico no es válido."),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
    role: z.enum(["school_admin", "operador"], { required_error: "El rol es requerido." }),
  })
  .refine((data) => data.email === data.emailConfirm, {
    message: "Los correos electrónicos no coinciden.",
    path: ["emailConfirm"],
  });

type CreateSchoolAdminDialogProps = {
  schools: School[];
  defaultSchoolId?: string;
};

export function CreateSchoolAdminDialog({ schools, defaultSchoolId }: CreateSchoolAdminDialogProps) {
  const [open, setOpen] = useState(false);
  const { user } = useUserProfile();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof createAdminSchema>>({
    resolver: zodResolver(createAdminSchema),
    defaultValues: {
      schoolId: defaultSchoolId && defaultSchoolId !== "all" ? defaultSchoolId : "",
      displayName: "",
      email: "",
      emailConfirm: "",
      password: "",
      role: "school_admin",
    },
  });

  const { isSubmitting } = form.formState;

  useEffect(() => {
    if (open && defaultSchoolId && defaultSchoolId !== "all") {
      form.setValue("schoolId", defaultSchoolId);
    }
  }, [open, defaultSchoolId, form]);

  async function onSubmit(values: z.infer<typeof createAdminSchema>) {
    const token = await user?.getIdToken?.().catch(() => null);
    if (!token) {
      toast({
        variant: "destructive",
        title: "Error de sesión",
        description: "No se pudo verificar tu sesión. Cerrá sesión y volvé a entrar.",
      });
      return;
    }

    try {
      const res = await fetch("/api/admin/create-school-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId: values.schoolId,
          displayName: values.displayName,
          email: values.email,
          password: values.password,
          role: values.role,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Error",
          description: data.error || "No se pudo crear el usuario.",
          duration: 8000,
        });
        return;
      }

      toast({
        title: "¡Usuario creado!",
        description: data.message || `${values.displayName} fue creado correctamente.`,
      });
      form.reset({
        schoolId: defaultSchoolId && defaultSchoolId !== "all" ? defaultSchoolId : "",
        displayName: "",
        email: "",
        emailConfirm: "",
        password: "",
        role: "school_admin",
      });
      setOpen(false);
    } catch (error: unknown) {
      console.error("[CreateSchoolAdminDialog] Error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Ocurrió un error inesperado al crear el usuario.",
      });
    }
  }

  const handleGeneratePassword = () => {
    form.setValue("password", generatePassword(), { shouldValidate: true });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Crear Administrador
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Administrador de Náutica</DialogTitle>
          <DialogDescription>
            Creá un usuario con email y contraseña para que administre una náutica específica.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="schoolId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Náutica</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccioná la náutica" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {schools.map((school) => (
                        <SelectItem key={school.id} value={school.id}>
                          {school.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre y Apellido</FormLabel>
                  <FormControl>
                    <Input placeholder="Juan Pérez" {...field} />
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
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="admin@nautica.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="emailConfirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmar Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="Repetí el correo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña inicial</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input type="text" placeholder="Mínimo 6 caracteres" {...field} />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleGeneratePassword}
                      title="Generar contraseña"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccioná un rol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="school_admin">Administrador</SelectItem>
                      <SelectItem value="operador">Operador</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset();
                  setOpen(false);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "Creando..." : "Crear Usuario"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
