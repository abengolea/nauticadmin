"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
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
import { Loader2, CheckCircle } from "lucide-react";
import { useAuth, useFirestore } from "@/firebase";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, doc, addDoc, setDoc, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import type { School } from "@/lib/types";
import { useCollection } from "@/firebase";

const registrationSchema = z
  .object({
    schoolId: z.string().min(1, "Seleccioná una náutica."),
    firstName: z.string().min(1, "El nombre es requerido."),
    lastName: z.string().min(1, "El apellido es requerido."),
    email: z.string().email("Debe ser un email válido."),
    emailConfirm: z.string().email("Debe ser un email válido."),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
    passwordConfirm: z.string().min(6, "Confirmá la contraseña."),
  })
  .refine((data) => data.email === data.emailConfirm, {
    message: "Los emails no coinciden.",
    path: ["emailConfirm"],
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirm"],
  });

type RegistrationFormValues = z.infer<typeof registrationSchema>;

export function PlayerRegistrationForm() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const { data: schools, loading: schoolsLoading } = useCollection<School>(
    "schools",
    { orderBy: ["name", "asc"] }
  );

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      schoolId: "",
      firstName: "",
      lastName: "",
      email: "",
      emailConfirm: "",
      password: "",
      passwordConfirm: "",
    },
  });

  async function onSubmit(values: RegistrationFormValues) {
    const emailNorm = values.email.trim().toLowerCase();

    try {
      // 1. Crear cuenta (email + contraseña); el usuario queda logueado
      await createUserWithEmailAndPassword(auth, emailNorm, values.password);

      // 2. Crear solicitud pendiente en la escuela con nombre y apellido
      const pendingRef = collection(
        firestore,
        `schools/${values.schoolId}/pendingPlayers`
      );
      await addDoc(pendingRef, {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: emailNorm,
        tutorContact: { name: "", phone: "" },
        submittedAt: Timestamp.now(),
        submittedBy: auth.currentUser?.uid ?? "",
      });

      await setDoc(doc(firestore, "pendingPlayerByEmail", emailNorm), {
        schoolId: values.schoolId,
        createdAt: Timestamp.now(),
      });

      // 3. Cerrar sesión para que no vea el panel hasta que lo aprueben
      await signOut(auth);

      setSubmitted(true);
      toast({
        title: "Solicitud enviada",
        description:
          "Un administrador de la náutica revisará tu solicitud. Cuando te aprueben, ingresá con tu email y la contraseña que elegiste.",
      });
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      console.error("Registro error:", { code: error.code, message: error.message, error });
      const isEmailInUse = error.code === "auth/email-already-in-use";
      const isRateLimit = error.code === "auth/too-many-requests";
      const isPermissionDenied = error.code === "permission-denied";
      toast({
        variant: "destructive",
        title: "Error",
        description: isEmailInUse
          ? "Este email ya está registrado. Si tenés cuenta, iniciá sesión. Si pediste acceso y aún no te aprobaron, contactá a la náutica."
          : isRateLimit
            ? "Demasiados intentos. Probá de nuevo en unos minutos."
            : isPermissionDenied
              ? "No se pudo guardar la solicitud. Verificá que las reglas de Firestore estén desplegadas."
              : error.message || "No se pudo completar el registro. Intentá de nuevo.",
      });
    }
  }

  if (submitted) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center rounded-full bg-primary/10 p-4">
          <CheckCircle className="h-12 w-12 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-center">Solicitud enviada</h3>
        <p className="text-sm text-muted-foreground text-center">
          Un administrador de la náutica revisará tu solicitud. Cuando te aprueben, podrás ingresar al panel con tu <strong>email</strong> y la <strong>contraseña</strong> que elegiste.
        </p>
        <p className="text-xs text-muted-foreground text-center">
          Si olvidás tu contraseña, en la pantalla de inicio de sesión usá <strong>Olvidé mi contraseña</strong>.
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="schoolId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Náutica</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={schoolsLoading}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná tu náutica" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(schools ?? [])
                    .filter((s) => s.status === "active")
                    .map((school) => (
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
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input placeholder="Tu nombre" {...field} />
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
                <Input placeholder="Tu apellido" {...field} />
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
                <Input type="email" placeholder="ejemplo@gmail.com" {...field} />
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
              <FormLabel>Confirmar email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="ejemplo@gmail.com" {...field} />
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
              <FormLabel>Contraseña</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Mínimo 6 caracteres" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="passwordConfirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirmar contraseña</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Repetí la contraseña" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={form.formState.isSubmitting || schoolsLoading}
        >
          {form.formState.isSubmitting && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {form.formState.isSubmitting ? "Enviando..." : "Enviar solicitud"}
        </Button>
      </form>
    </Form>
  );
}
