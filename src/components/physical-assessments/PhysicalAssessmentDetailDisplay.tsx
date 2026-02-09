"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { PhysicalAssessment, PhysicalAssessmentConfig } from "@/lib/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { useFirestore, errorEmitter, FirestorePermissionError } from "@/firebase";
import { doc, deleteDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { getFieldLabel, type PhysicalAssessmentConfigPartial } from "@/lib/physical-assessments";

interface PhysicalAssessmentDetailDisplayProps {
  assessment: PhysicalAssessment;
  schoolId: string;
  physicalConfig?: PhysicalAssessmentConfig | null;
  onDeleted: () => void;
  onEditClick: (assessment: PhysicalAssessment) => void;
}

export function PhysicalAssessmentDetailDisplay({
  assessment,
  schoolId,
  physicalConfig,
  onDeleted,
  onEditClick,
}: PhysicalAssessmentDetailDisplayProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(firestore, `schools/${schoolId}/physicalAssessments/${assessment.id}`));
      toast({ title: "Evaluación física eliminada" });
      onDeleted();
    } catch (err) {
      errorEmitter.emit("permission-error", new FirestorePermissionError({
        path: `schools/${schoolId}/physicalAssessments/${assessment.id}`,
        operation: "delete",
      }));
      toast({ variant: "destructive", title: "Error al eliminar" });
    } finally {
      setDeleting(false);
    }
  };

  const tests = assessment.tests ? Object.entries(assessment.tests) : [];

  return (
    <div className="space-y-6 p-4 bg-muted/30 rounded-lg">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => onEditClick(assessment)}>
          <Pencil className="h-4 w-4 mr-1" />
          Editar
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-1" />
              Borrar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Borrar esta evaluación física?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Se eliminará la evaluación del{" "}
                {assessment.date ? format(assessment.date, "d 'de' MMMM 'de' yyyy", { locale: es }) : "esta fecha"}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                {deleting ? "Eliminando..." : "Borrar evaluación"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-xl">
            Evaluación física del{" "}
            {assessment.date ? format(assessment.date, "d 'de' MMMM 'de' yyyy", { locale: es }) : "fecha desconocida"}
          </CardTitle>
          <CardDescription>
            Grupo {assessment.ageGroup} años · Edad: {Math.floor(assessment.edad_en_meses / 12)} años y{" "}
            {assessment.edad_en_meses % 12} meses
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Altura</p>
              <p className="font-semibold">{assessment.altura_cm} cm</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Peso</p>
              <p className="font-semibold">{assessment.peso_kg} kg</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">IMC</p>
              <p className="font-semibold">{assessment.imc}</p>
            </div>
          </div>
          {assessment.observaciones_generales && (
            <div>
              <p className="text-sm font-medium mb-1">Observaciones generales</p>
              <p className="text-sm text-muted-foreground">{assessment.observaciones_generales}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {tests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tests físicos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {tests.map(([key, value]) => (
                <div key={key} className="flex justify-between items-center text-sm py-1">
                  <span className="text-muted-foreground">
                    {getFieldLabel(key, assessment.ageGroup, physicalConfig as PhysicalAssessmentConfigPartial | undefined)}
                  </span>
                  <span className="font-mono font-semibold">
                    {typeof value === "number" ? value : value ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
