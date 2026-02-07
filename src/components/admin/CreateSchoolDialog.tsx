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
import { Loader2, PlusCircle } from "lucide-react";
import { useFirestore } from "@/firebase";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

const schoolSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  city: z.string().min(2, "La ciudad es requerida."),
  province: z.string().min(2, "La provincia es requerida."),
  address: z.string().optional(),
});

export function CreateSchoolDialog() {
  const [open, setOpen] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof schoolSchema>>({
    resolver: zodResolver(schoolSchema),
    defaultValues: {
      name: "",
      city: "",
      province: "",
      address: "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: z.infer<typeof schoolSchema>) {
    const schoolsCollectionRef = collection(firestore, 'schools');
    const schoolData = {
        ...values,
        status: 'active' as const,
        createdAt: Timestamp.now(),
    };
    
    try {
        await addDoc(schoolsCollectionRef, schoolData);
        toast({
            title: "Escuela Creada",
            description: `La escuela "${values.name}" ha sido creada exitosamente.`,
        });
        form.reset();
        setOpen(false);
    } catch (serverError: any) {
        const permissionError = new FirestorePermissionError({
            path: 'schools',
            operation: 'create',
            requestResourceData: schoolData,
        });
        errorEmitter.emit('permission-error', permissionError);
        
        toast({
            variant: "destructive",
            title: "Error al crear la escuela",
            description: "No tienes los permisos necesarios o ocurrió un error.",
        });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Crear Nueva Escuela
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear Nueva Escuela</DialogTitle>
          <DialogDescription>
            Completa los datos para registrar una nueva sede en la plataforma.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Sede</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Escuela de River - Córdoba" {...field} />
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "Creando..." : "Crear Escuela"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
