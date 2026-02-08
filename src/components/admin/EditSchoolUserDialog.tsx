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
  FormDescription,
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
import { Loader2 } from "lucide-react";
import { useFirestore, useCollection, useUserProfile } from "@/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import type { SchoolUser, Category } from "@/lib/types";
import { Checkbox } from "../ui/checkbox";

const editUserSchema = z.object({
  displayName: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  role: z.enum(["school_admin", "coach"], { required_error: "El rol es requerido."}),
  assignedCategories: z.array(z.string()).optional(),
});

interface EditSchoolUserDialogProps {
    schoolId: string;
    user: SchoolUser;
    children: React.ReactNode;
}

export function EditSchoolUserDialog({ schoolId, user, children }: EditSchoolUserDialogProps) {
  const [open, setOpen] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();
  const { data: categories, loading: categoriesLoading } = useCollection<Category>(`schools/${schoolId}/categories`, { orderBy: ['name', 'asc'] });
  const { user: currentUser } = useUserProfile();

  const form = useForm<z.infer<typeof editUserSchema>>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      displayName: user.displayName,
      role: user.role,
      assignedCategories: user.assignedCategories || [],
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: z.infer<typeof editUserSchema>) {
    const userRef = doc(firestore, `schools/${schoolId}/users`, user.id);
    
    try {
      await updateDoc(userRef, {
        displayName: values.displayName,
        role: values.role,
        assignedCategories: values.role === 'coach' ? values.assignedCategories : [],
      });

      toast({
        title: "¡Usuario actualizado!",
        description: `Los datos de ${values.displayName} han sido guardados.`,
      });
      setOpen(false);

    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Error al actualizar",
            description: "No se pudieron guardar los cambios. Por favor, revisa tus permisos e inténtalo de nuevo.",
        });
    }
  }

  const isEditingSelf = currentUser?.uid === user.id;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
            form.reset({
                displayName: user.displayName,
                role: user.role,
                assignedCategories: user.assignedCategories || [],
            });
        }
    }}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Usuario de Escuela</DialogTitle>
          <DialogDescription>
            Modifica el rol y las categorías asignadas para este usuario.
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
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                   <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isEditingSelf}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un rol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="school_admin">Administrador de Escuela</SelectItem>
                      <SelectItem value="coach">Entrenador</SelectItem>
                    </SelectContent>
                  </Select>
                  {isEditingSelf && <FormDescription>No puedes cambiar tu propio rol.</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {form.watch('role') === 'coach' && (
              <FormField
                control={form.control}
                name="assignedCategories"
                render={() => (
                  <FormItem>
                    <FormLabel>Categorías Asignadas</FormLabel>
                    <div className="rounded-md border p-4 max-h-36 overflow-y-auto space-y-2">
                        {categoriesLoading ? <p className="text-sm text-center text-muted-foreground">Cargando categorías...</p> : 
                        categories && categories.length > 0 ? categories.map((category) => (
                            <FormField
                                key={category.id}
                                control={form.control}
                                name="assignedCategories"
                                render={({ field }) => {
                                return (
                                    <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                        <FormControl>
                                            <Checkbox
                                            checked={field.value?.includes(category.id)}
                                            onCheckedChange={(checked) => {
                                                return checked
                                                ? field.onChange([...(field.value || []), category.id])
                                                : field.onChange(
                                                    (field.value || []).filter(
                                                        (value) => value !== category.id
                                                    )
                                                    );
                                            }}
                                            />
                                        </FormControl>
                                        <FormLabel className="font-normal text-sm">
                                            {category.name}
                                        </FormLabel>
                                    </FormItem>
                                );
                                }}
                            />
                        )) : <p className="text-sm text-center text-muted-foreground">No hay categorías creadas.</p>}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
