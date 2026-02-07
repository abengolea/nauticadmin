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
        <CardTitle>Medical History</CardTitle>
        <CardDescription>Injury records for {player.firstName}.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Body Part</TableHead>
              <TableHead>Injury Date</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {playerInjuries.length > 0 ? (
              playerInjuries.map((injury) => (
                <TableRow key={injury.id}>
                  <TableCell className="font-medium">{injury.bodyPart}</TableCell>
                  <TableCell>{injury.injuryDate.toLocaleDateString()}</TableCell>
                  <TableCell className="capitalize">{injury.severity}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        injury.status === "recovering"
                          ? "destructive"
                          : injury.status === "discharged"
                          ? "secondary"
                          : "outline"
                      }
                       className={injury.status === "discharged" ? "border-green-600/50 bg-green-500/10 text-green-700 dark:text-green-400" : ""}
                    >
                      {injury.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No injury history recorded.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
