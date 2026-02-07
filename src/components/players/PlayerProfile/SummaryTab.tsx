import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { Player } from "@/lib/types";
import { sessions, injuries } from "@/lib/mock-data";

export function SummaryTab({ player }: { player: Player }) {
    const lastSession = sessions[0];
    const lastInjury = injuries[1];

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
                            <TableRow>
                                <TableCell className="font-medium text-muted-foreground">Posición</TableCell>
                                <TableCell className="text-right">{player.primaryPosition}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell className="font-medium text-muted-foreground">Categoría</TableCell>
                                <TableCell className="text-right">{player.category}</TableCell>
                            </TableRow>
                             <TableRow>
                                <TableCell className="font-medium text-muted-foreground">Estado</TableCell>
                                <TableCell className="text-right capitalize">{player.status}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Actividad Reciente</CardTitle>
                    <CardDescription>Última sesión y actualización médica.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                   <div className="flex items-start gap-4">
                        <div className="rounded-md bg-secondary p-2">
                           <p className="text-sm font-bold text-secondary-foreground">{lastSession.date.getDate()}</p>
                           <p className="text-xs text-secondary-foreground">{lastSession.date.toLocaleString('es-ES', { month: 'short' })}</p>
                        </div>
                        <div>
                            <p className="font-semibold capitalize">Última Sesión: {lastSession.type}</p>
                            <p className="text-sm text-muted-foreground">Categoría: {lastSession.category}</p>
                        </div>
                   </div>
                   <div className="flex items-start gap-4">
                        <div className="rounded-md bg-destructive/20 p-2">
                           <p className="text-sm font-bold text-destructive">{lastInjury.injuryDate.getDate()}</p>
                           <p className="text-xs text-destructive">{lastInjury.injuryDate.toLocaleString('es-ES', { month: 'short' })}</p>
                        </div>
                        <div>
                            <p className="font-semibold capitalize">Actualización Médica: {lastInjury.status}</p>
                            <p className="text-sm text-muted-foreground">Parte: {lastInjury.bodyPart}</p>
                        </div>
                   </div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Objetivos Individuales</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Goals would be listed here */}
                    <p className="text-muted-foreground text-sm">No hay objetivos establecidos.</p>
                </CardContent>
            </Card>
        </div>
    );
}
