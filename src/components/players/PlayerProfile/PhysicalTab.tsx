import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Player } from "@/lib/types";
import { physicalTests } from "@/lib/mock-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EvolutionChart } from "@/components/charts/EvolutionChart";
import { ComparativeAnalytics } from "@/components/ai/ComparativeAnalytics";

export function PhysicalTab({ player }: { player: Player }) {
  const sprintData = physicalTests.filter(t => t.testType.includes("Sprint"));
  const jumpData = physicalTests.filter(t => t.testType.includes("Salto"));

  return (
    <div className="grid gap-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Evolución Sprint 10m</CardTitle>
            <CardDescription>Progreso en los últimos 3 meses.</CardDescription>
          </CardHeader>
          <CardContent>
            <EvolutionChart data={sprintData} dataKey="value" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Evolución Salto Vertical</CardTitle>
            <CardDescription>Progreso en los últimos 3 meses.</CardDescription>
          </CardHeader>
          <CardContent>
            <EvolutionChart data={jumpData} dataKey="value" />
          </CardContent>
        </Card>
      </div>
      
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Historial de Pruebas</CardTitle>
            <CardDescription>Todas las evaluaciones físicas registradas para {player.firstName}.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de Prueba</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {physicalTests.map((test) => (
                  <TableRow key={test.id}>
                    <TableCell className="font-medium">{test.testType}</TableCell>
                    <TableCell>{test.date.toLocaleDateString('es-ES')}</TableCell>
                    <TableCell className="text-right">{test.value} {test.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <ComparativeAnalytics playerId={player.id} escuelaId={player.escuelaId} />
      </div>
    </div>
  );
}
