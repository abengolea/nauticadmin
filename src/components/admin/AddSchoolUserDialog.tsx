"use client";

import { useState } from "react";
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
import { UserPlus } from "lucide-react";

export function AddSchoolUserDialog({ schoolId }: { schoolId: string }) {
  const [open, setOpen] = useState(false);

  // This function will be implemented later
  async function onSubmit() {
    console.log("Submitting form for school:", schoolId);
    setOpen(false);
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
            Asigna un nuevo responsable (administrador o entrenador) a esta escuela.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-8 text-center text-muted-foreground">
            <p>El formulario para añadir usuarios se implementará aquí.</p>
        </div>

        <DialogFooter className="pt-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" onClick={onSubmit} disabled>
            Guardar Usuario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
