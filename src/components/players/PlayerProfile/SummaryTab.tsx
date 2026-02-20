"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { EditCoachFeedbackDialog } from "@/components/players/EditCoachFeedbackDialog";
import type { Player } from "@/lib/types";

const POSICION_LABELS: Record<string, string> = {
  delantero: "Delantero",
  mediocampo: "Mediocampo",
  defensor: "Defensor",
  arquero: "Arquero",
};

const PIE_LABELS: Record<string, string> = {
  derecho: "Derecho",
  izquierdo: "Izquierdo",
  ambidiestro: "Ambidiestro",
};

interface SummaryTabProps {
  player: Player;
  lastCoachComment?: string;
  canEditCoachFeedback?: boolean;
  schoolId?: string;
  playerId?: string;
}

export function SummaryTab({ player, lastCoachComment, canEditCoachFeedback, schoolId, playerId }: SummaryTabProps) {
    const [editFeedbackOpen, setEditFeedbackOpen] = useState(false);
    const hasDeportivo = player.posicion_preferida || player.pie_dominante || player.altura_cm || player.peso_kg;
    const hasNautico =
      player.embarcacionNombre ||
      player.embarcacionMatricula ||
      player.embarcacionMedidas ||
      player.ubicacion ||
      player.clienteDesde ||
      player.creditoActivo != null ||
      (player.personasAutorizadas && player.personasAutorizadas.length > 0) ||
      player.embarcacionDatos;

    const displayFeedback =
      (player.coachFeedback?.trim() || lastCoachComment?.trim() || player.observations?.trim()) ||
      "No hay observaciones registradas para este cliente.";

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Información Clave</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableBody>
                            <TableRow>
                                <TableCell className="font-medium text-muted-foreground">Nombre Completo</TableCell>
                                <TableCell className="text-right">{player.firstName} {player.lastName}</TableCell>
                            </TableRow>
                            {player.dni && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">DNI</TableCell>
                                    <TableCell className="text-right">{player.dni}</TableCell>
                                </TableRow>
                            )}
                            {player.email && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Email (acceso al panel)</TableCell>
                                    <TableCell className="text-right">{player.email}</TableCell>
                                </TableRow>
                            )}
                             <TableRow>
                                <TableCell className="font-medium text-muted-foreground">Estado</TableCell>
                                <TableCell className="text-right capitalize">
                                  {player.status === "active" ? "Activo" : player.status === "suspended" ? "Mora" : "Inactivo"}
                                </TableCell>
                            </TableRow>
                             {(player.tutorContact?.phone?.trim()) ? (
                            <TableRow>
                                <TableCell className="font-medium text-muted-foreground">Teléfono</TableCell>
                                <TableCell className="text-right">{player.tutorContact.phone}</TableCell>
                            </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            {hasNautico && (
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Información de la embarcación</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableBody>
                            {player.embarcacionNombre && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Nombre embarcación</TableCell>
                                    <TableCell className="text-right">{player.embarcacionNombre}</TableCell>
                                </TableRow>
                            )}
                            {player.embarcacionMatricula && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Matrícula</TableCell>
                                    <TableCell className="text-right">{player.embarcacionMatricula}</TableCell>
                                </TableRow>
                            )}
                            {player.embarcacionMedidas && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Medidas</TableCell>
                                    <TableCell className="text-right">{player.embarcacionMedidas}</TableCell>
                                </TableRow>
                            )}
                            {player.ubicacion && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Ubicación (amarra/muelle)</TableCell>
                                    <TableCell className="text-right">{player.ubicacion}</TableCell>
                                </TableRow>
                            )}
                            {player.clienteDesde && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Cliente desde</TableCell>
                                    <TableCell className="text-right">{player.clienteDesde}</TableCell>
                                </TableRow>
                            )}
                            {player.creditoActivo != null && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Crédito activo</TableCell>
                                    <TableCell className="text-right">{player.creditoActivo ? "Sí" : "No"}</TableCell>
                                </TableRow>
                            )}
                            {player.personasAutorizadas && player.personasAutorizadas.length > 0 && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Personas autorizadas</TableCell>
                                    <TableCell className="text-right">
                                        {Array.isArray(player.personasAutorizadas)
                                          ? player.personasAutorizadas.join(", ")
                                          : String(player.personasAutorizadas)}
                                    </TableCell>
                                </TableRow>
                            )}
                            {player.embarcacionDatos && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Datos adicionales</TableCell>
                                    <TableCell className="text-right">{player.embarcacionDatos}</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            )}
            {hasDeportivo && (
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Perfil deportivo</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableBody>
                            {player.posicion_preferida && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Posición</TableCell>
                                    <TableCell className="text-right">{POSICION_LABELS[player.posicion_preferida] || player.posicion_preferida}</TableCell>
                                </TableRow>
                            )}
                            {player.pie_dominante && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Pie predominante</TableCell>
                                    <TableCell className="text-right">{PIE_LABELS[player.pie_dominante] || player.pie_dominante}</TableCell>
                                </TableRow>
                            )}
                            {player.altura_cm != null && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Altura</TableCell>
                                    <TableCell className="text-right">{player.altura_cm} cm</TableCell>
                                </TableRow>
                            )}
                            {player.peso_kg != null && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Peso</TableCell>
                                    <TableCell className="text-right">{player.peso_kg} kg</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            )}
             <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="font-headline">Notas y observaciones</CardTitle>
                    {canEditCoachFeedback && schoolId && playerId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditFeedbackOpen(true)}
                        className="shrink-0"
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                    )}
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground italic">
                        {displayFeedback}
                    </p>
                </CardContent>
            </Card>
            {canEditCoachFeedback && schoolId && playerId && (
              <EditCoachFeedbackDialog
                isOpen={editFeedbackOpen}
                onOpenChange={setEditFeedbackOpen}
                schoolId={schoolId}
                playerId={playerId}
                playerName={`${player.firstName ?? ""} ${player.lastName ?? ""}`.trim()}
                initialValue={player.coachFeedback ?? lastCoachComment ?? player.observations ?? ""}
              />
            )}
        </div>
    );
}
