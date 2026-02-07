import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Player } from "@/lib/types";
import { injuries } from "@/lib/mock-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function MedicalTab({ player }: { player: Player }) {
  const playerInjuries = injuries.sort((a, b) => b.injuryDate.getTime() - a.injuryDate.getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial Médico</CardTitle>
        <CardDescription>Historial de lesiones para {player.firstName}.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parte del Cuerpo</TableHead>
              <TableHead>Fecha de Lesión</TableHead>
              <TableHead>Gravedad</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {playerInjuries.length > 0 ? (
              playerInjuries.map((injury) => (
                <TableRow key={injury.id}>
                  <TableCell className="font-medium">{injury.bodyPart}</TableCell>
                  <TableCell>{injury.injuryDate.toLocaleDateString('es-ES')}</TableCell>
                  <TableCell className="capitalize">{injury.severity}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        injury.status === "recuperando"
                          ? "destructive"
                          : injury.status === "alta"
                          ? "secondary"
                          : "outline"
                      }
                       className={`capitalize ${injury.status === "alta" ? "border-green-600/50 bg-green-500/10 text-green-700 dark:text-green-400" : ""}`}
                    >
                      {injury.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No hay historial de lesiones registrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
