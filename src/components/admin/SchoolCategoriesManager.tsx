"use client";

import { useState } from "react";
import { useCollection, useFirestore } from "@/firebase";
import type { Category } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Loader2, Plus, Trash, Tags } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addDoc, collection, deleteDoc, doc } from "firebase/firestore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "../ui/skeleton";

export function SchoolCategoriesManager({ schoolId }: { schoolId: string }) {
  const { data: categories, loading } = useCollection<Category>(`schools/${schoolId}/categories`, { orderBy: ['name', 'asc'] });
  const firestore = useFirestore();
  const { toast } = useToast();

  const [newCategory, setNewCategory] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleAddCategory = async () => {
    if (!newCategory.trim()) {
      toast({ variant: "destructive", title: "El nombre no puede estar vacío." });
      return;
    }
    setIsAdding(true);
    try {
      await addDoc(collection(firestore, `schools/${schoolId}/categories`), {
        name: newCategory.trim()
      });
      toast({ title: "Categoría añadida", description: `Se ha añadido "${newCategory.trim()}".` });
      setNewCategory("");
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo añadir la categoría." });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(firestore, `schools/${schoolId}/categories`, categoryToDelete.id));
      toast({ title: "Categoría eliminada", description: `Se ha eliminado "${categoryToDelete.name}".` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar la categoría." });
    } finally {
      setIsDeleting(false);
      setCategoryToDelete(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5" />
            Gestionar Categorías
          </CardTitle>
          <CardDescription>
            Añade o elimina las categorías de edad (ej. Sub-14, Sub-16) para esta escuela.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Nombre de la nueva categoría"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              disabled={isAdding}
            />
            <Button onClick={handleAddCategory} disabled={isAdding || !newCategory.trim()}>
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="hidden sm:inline ml-2">Añadir</span>
            </Button>
          </div>

          <div className="rounded-md border">
            {loading && (
              <div className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            )}
            {!loading && categories?.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">No hay categorías definidas.</p>
            )}
            {!loading && categories && categories.length > 0 && (
              <ul className="divide-y">
                {categories.map((cat) => (
                  <li key={cat.id} className="flex items-center justify-between p-3">
                    <span className="font-medium">{cat.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setCategoryToDelete(cat)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la categoría <span className="font-semibold">{categoryToDelete?.name}</span>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCategory}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeleting ? "Eliminando..." : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
