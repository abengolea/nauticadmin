"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { FilePlus, ClipboardList, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Evaluation } from "@/lib/types";
import { EvaluationDetailDisplay } from "./EvaluationDetailDisplay";
import { EvaluationEvolutionCharts } from "./EvaluationEvolutionCharts";

interface EvaluationsTabProps {
  playerId: string;
  schoolId: string;
  evaluations: Evaluation[] | undefined;
  loading: boolean;
  error: unknown;
  onOpenCreate: () => void;
  onEditClick: (evaluation: Evaluation) => void;
  /** Jugador viendo su perfil: no mostrar botones de crear/editar evaluación. */
  isViewingAsPlayer?: boolean;
}

export function EvaluationsTab({
  playerId,
  schoolId,
  evaluations,
  loading,
  error,
  onOpenCreate,
  onEditClick,
  isViewingAsPlayer = false,
}: EvaluationsTabProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold font-headline">Evaluaciones futbolísticas</h2>
        {!isViewingAsPlayer && (
          <Button onClick={onOpenCreate}>
            <FilePlus className="mr-2 h-4 w-4" />
            Nueva evaluación
          </Button>
        )}
      </div>

      <Tabs defaultValue="historial" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="historial" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Historial
          </TabsTrigger>
          <TabsTrigger value="evolucion" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Evolución
          </TabsTrigger>
        </TabsList>
        <TabsContent value="historial">
          {error ? (
            <Card>
              <CardContent className="p-10 text-center">
                <h3 className="font-semibold">Error al cargar evaluaciones</h3>
                <p className="text-muted-foreground mt-2">
                  Es posible que falte un índice en Firestore. Ejecuta:{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    firebase deploy --only firestore:indexes
                  </code>
                  {" "}y espera unos minutos.
                </p>
                {!isViewingAsPlayer && (
                  <Button className="mt-4" onClick={onOpenCreate}>
                    <FilePlus className="mr-2 h-4 w-4" />
                    Crear evaluación
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : !evaluations?.length ? (
            <Card>
              <CardContent className="p-10 text-center">
                <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                <h3 className="font-semibold">Sin evaluaciones futbolísticas</h3>
                <p className="text-muted-foreground mt-2">
                  Aún no se han registrado evaluaciones para este jugador. Añade la primera evaluación.
                </p>
                {!isViewingAsPlayer && (
                  <Button className="mt-4" onClick={onOpenCreate}>
                    <FilePlus className="mr-2 h-4 w-4" />
                    Crear primera evaluación
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {evaluations.map((evaluation) => (
                <AccordionItem value={evaluation.id} key={evaluation.id}>
                  <AccordionTrigger>
                    <div className="flex justify-between w-full pr-4 items-center gap-2">
                      <span className="font-semibold">
                        Evaluación del{" "}
                        {evaluation.date
                          ? format(
                              evaluation.date instanceof Date ? evaluation.date : new Date(evaluation.date),
                              "PPP",
                              { locale: es }
                            )
                          : "Fecha desconocida"}
                      </span>
                      <span className="text-sm text-muted-foreground flex items-center gap-2">
                        {evaluation.position && (
                          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize">
                            {evaluation.position}
                          </span>
                        )}
                        Ver detalles
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <EvaluationDetailDisplay
                      evaluation={evaluation}
                      schoolId={schoolId}
                      onDeleted={() => {}}
                      onEditClick={onEditClick}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </TabsContent>
        <TabsContent value="evolucion">
          {!evaluations?.length ? (
            <Card>
              <CardContent className="p-10 text-center">
                <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                <h3 className="font-semibold">Seguimiento en el tiempo</h3>
                <p className="text-muted-foreground mt-2">
                  Cuando haya al menos dos evaluaciones con la misma métrica, aquí aparecerán los gráficos de
                  evolución.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Añade más evaluaciones en la pestaña Historial para ver la evolución de cada habilidad.
                </p>
                {!isViewingAsPlayer && (
                  <Button className="mt-4" onClick={onOpenCreate}>
                    <FilePlus className="mr-2 h-4 w-4" />
                    Crear evaluación
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <EvaluationEvolutionCharts
              evaluations={evaluations}
              emptyStateRefTab="Historial"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
