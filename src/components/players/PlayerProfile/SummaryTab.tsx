"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, ExternalLink } from "lucide-react";
import { EditCoachFeedbackDialog } from "@/components/players/EditCoachFeedbackDialog";
import type { Player } from "@/lib/types";
import { getPlayerEmbarcaciones } from "@/lib/utils";
import { useDoc } from "@/firebase";
import type { BoatPricingConfig } from "@/lib/types/boat-pricing";
import { getDefaultBoatPricingItems } from "@/lib/types/boat-pricing";

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
  /** Si se pasa, se muestra botón "Editar embarcación" que abre el diálogo de edición en la pestaña Embarcación */
  onEditEmbarcacion?: () => void;
}

export function SummaryTab({ player, lastCoachComment, canEditCoachFeedback, schoolId, playerId, onEditEmbarcacion }: SummaryTabProps) {
    const [editFeedbackOpen, setEditFeedbackOpen] = useState(false);
    const embarcaciones = getPlayerEmbarcaciones(player);
    const { data: boatPricing } = useDoc<BoatPricingConfig & { id: string }>(
      schoolId ? `schools/${schoolId}/boatPricingConfig/default` : ""
    );
    const pricingItems = boatPricing?.items?.length ? boatPricing.items : getDefaultBoatPricingItems();
    const pricingMap = new Map(pricingItems.map((i) => [i.id, i]));
    const serviciosAdicionales = (player as { serviciosAdicionales?: { id: string; claseId: string }[] }).serviciosAdicionales ?? [];
    const hasDeportivo = player.posicion_preferida || player.pie_dominante || player.altura_cm || player.peso_kg;
    const hasNautico =
      embarcaciones.length > 0 ||
      serviciosAdicionales.length > 0 ||
      player.ubicacion ||
      player.clienteDesde ||
      player.creditoActivo != null ||
      (player as { condicionIVA?: string }).condicionIVA ||
      (player.personasAutorizadas && player.personasAutorizadas.length > 0) ||
      (player as { documentacion?: string }).documentacion;
    const showEmbarcacionCard = hasNautico || onEditEmbarcacion;

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
            {showEmbarcacionCard && (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="font-headline">
                      {embarcaciones.length > 1 ? "Embarcaciones" : "Información de la embarcación"}
                    </CardTitle>
                    {onEditEmbarcacion && (
                      <Button variant="outline" size="sm" onClick={onEditEmbarcacion}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Editar embarcación
                      </Button>
                    )}
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableBody>
                            {embarcaciones.length === 0 && onEditEmbarcacion && (
                              <TableRow>
                                <TableCell colSpan={2} className="text-sm text-muted-foreground italic py-4">
                                  No hay embarcaciones cargadas. Hacé clic en &quot;Editar embarcación&quot; para agregar una o más.
                                </TableCell>
                              </TableRow>
                            )}
                            {embarcaciones.map((emb, idx) => (
                              <React.Fragment key={emb.id}>
                                {embarcaciones.length > 1 && (
                                  <TableRow key={`emb-${idx}-sep`}>
                                    <TableCell colSpan={2} className="font-medium bg-muted/50">
                                      Embarcación {idx + 1}
                                    </TableCell>
                                  </TableRow>
                                )}
                                {emb.nombre && (
                                  <TableRow key={`emb-${idx}-nombre`}>
                                    <TableCell className="font-medium text-muted-foreground">Nombre</TableCell>
                                    <TableCell className="text-right">{emb.nombre}</TableCell>
                                  </TableRow>
                                )}
                                {emb.matricula && (
                                  <TableRow key={`emb-${idx}-mat`}>
                                    <TableCell className="font-medium text-muted-foreground">Matrícula</TableCell>
                                    <TableCell className="text-right">{emb.matricula}</TableCell>
                                  </TableRow>
                                )}
                                {emb.medidas && (
                                  <TableRow key={`emb-${idx}-med`}>
                                    <TableCell className="font-medium text-muted-foreground">Medidas</TableCell>
                                    <TableCell className="text-right">{emb.medidas}</TableCell>
                                  </TableRow>
                                )}
                                {emb.lona && (
                                  <TableRow key={`emb-${idx}-lona`}>
                                    <TableCell className="font-medium text-muted-foreground">Lona</TableCell>
                                    <TableCell className="text-right">{emb.lona}</TableCell>
                                  </TableRow>
                                )}
                                {emb.claseId && (
                                  <TableRow key={`emb-${idx}-clase`}>
                                    <TableCell className="font-medium text-muted-foreground">Clase (canon)</TableCell>
                                    <TableCell className="text-right">
                                      {pricingMap.get(emb.claseId)?.label ?? emb.claseId}
                                      {pricingMap.get(emb.claseId)?.price != null && (
                                        <span className="text-muted-foreground ml-1">
                                          (${pricingMap.get(emb.claseId)!.price!.toLocaleString("es-AR")}/mes)
                                        </span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                )}
                                {emb.datos && (
                                  <TableRow key={`emb-${idx}-datos`}>
                                    <TableCell className="font-medium text-muted-foreground">Datos adicionales</TableCell>
                                    <TableCell className="text-right">{emb.datos}</TableCell>
                                  </TableRow>
                                )}
                              </React.Fragment>
                            ))}
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
                            {(player as { condicionIVA?: string }).condicionIVA && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Condición IVA</TableCell>
                                    <TableCell className="text-right">{(player as { condicionIVA: string }).condicionIVA}</TableCell>
                                </TableRow>
                            )}
                            {serviciosAdicionales.length > 0 && (
                                <>
                                  <TableRow>
                                    <TableCell colSpan={2} className="font-medium bg-muted/50 pt-4">
                                      Servicios adicionales
                                    </TableCell>
                                  </TableRow>
                                  {serviciosAdicionales.map((s) => {
                                    const item = pricingMap.get(s.claseId);
                                    return (
                                      <TableRow key={s.id}>
                                        <TableCell className="font-medium text-muted-foreground">{item?.label ?? s.claseId}</TableCell>
                                        <TableCell className="text-right">
                                          {item?.price != null ? `$${item.price.toLocaleString("es-AR")}/mes` : "-"}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </>
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
                            {(player as { documentacion?: string }).documentacion && (
                                <TableRow>
                                    <TableCell className="font-medium text-muted-foreground">Documentación</TableCell>
                                    <TableCell className="text-right">
                                        <a
                                            href={(player as { documentacion: string }).documentacion}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-primary hover:underline"
                                        >
                                            Ver en Google Drive
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                    </TableCell>
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
