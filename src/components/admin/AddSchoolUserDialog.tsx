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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, UserPlus } from "lucide-react";
import { useAuth, useFirestore } from "@/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

const addUserSchema = z.object({
  displayName: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  email: z.string().email("El correo electrónico no es válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
  role: z.enum(["school_admin", "coach"], { required_error: "El rol es requerido."}),
});

export function AddSchoolUserDialog({ schoolId }: { schoolId: string }) {
  const [open, setOpen] = useState(false);
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof addUserSchema>>({
    resolver: zodResolver(addUserSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: z.infer<typeof addUserSchema>) {
    let newUser;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
        newUser = userCredential.user;
        await updateProfile(newUser, { displayName: values.displayName });
    } catch (authError: any) {
        let description = "Ocurrió un error al crear el usuario.";
        if (authError.code === 'auth/email-already-in-use') {
            description = "El correo electrónico proporcionado ya está en uso por otro usuario.";
        } else if (authError.code === 'auth/weak-password') {
            description = "La contraseña proporcionada es demasiado débil (mínimo 6 caracteres).";
        }
        toast({
            variant: "destructive",
            title: "Error de Autenticación",
            description: description,
        });
        return; 
    }

    const schoolUserRef = doc(firestore, 'schools', schoolId, 'users', newUser.uid);

    const schoolUserData = {
        displayName: values.displayName,
        email: values.email,
        role: values.role,
        assignedCategories: [],
    };

    try {
        await setDoc(schoolUserRef, schoolUserData);
        toast({
            title: "¡Usuario añadido!",
            description: `${values.displayName} ha sido añadido a la escuela como ${values.role}.`,
        });
        form.reset();
        setOpen(false);
    } catch (firestoreError: any) {
        console.error("Firestore setDoc failed:", firestoreError);
        toast({
            variant: "destructive",
            title: "Error Crítico de Base de Datos",
            description: `Se creó el usuario de autenticación para ${values.email}, pero no se pudo asignar el rol en la escuela. Por favor, contacta a soporte para solucionar este problema o elimina el usuario y vuelve a intentarlo.`,
            duration: 15000, 
        });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Añadir Responsable
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir Usuario a la Escuela</DialogTitle>
          <DialogDescription>
            Crea un nuevo usuario y asígnalo como responsable (administrador o entrenador) a esta escuela.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre y Apellido</FormLabel>
                  <FormControl>
                    <Input placeholder="Enzo Pérez" {...field} />
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
                    <Input type="email" placeholder="eperez@riverplate.com" {...field} />
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
                  <FormLabel>Contraseña Inicial</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
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
                   <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un rol para el usuario" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="school_admin">Administrador de Escuela</SelectItem>
                      <SelectItem value="coach">Entrenador</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => { form.reset(); setOpen(false); }}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "Guardando..." : "Guardar Usuario"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
