import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Player } from "@/lib/types";
import { technicalEvaluations } from "@/lib/mock-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

export function TechnicalTab({ player }: { player: Player }) {
  
  const lastEval = technicalEvaluations[technicalEvaluations.length - 1];

  return (
    <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
            <CardHeader>
                <CardTitle>Evaluation History</CardTitle>
                <CardDescription>Recent technical assessments for {player.firstName}.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Control</TableHead>
                            <TableHead>Passing</TableHead>
                            <TableHead>Dribbling</TableHead>
                            <TableHead>Shooting</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {technicalEvaluations.map((ev) => (
                            <TableRow key={ev.id}>
                                <TableCell>{ev.date.toLocaleDateString()}</TableCell>
                                <TableCell>{ev.scores.ballControl}/10</TableCell>
                                <TableCell>{ev.scores.passing}/10</TableCell>
                                <TableCell>{ev.scores.dribbling}/10</TableCell>
                                <TableCell>{ev.scores.shooting}/10</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Latest Assessment</CardTitle>
                 <CardDescription>{lastEval.date.toLocaleDateString()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {Object.entries(lastEval.scores).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="capitalize text-muted-foreground">{key.replace(/([A-Z])/g, ' $1')}</span>
                            <span className="font-medium">{value}/10</span>
                        </div>
                        <Progress value={value * 10} className="h-2" />
                    </div>
                ))}
                <div className="pt-4">
                    <h4 className="font-semibold">Coach Notes:</h4>
                    <p className="text-sm text-muted-foreground italic">&quot;{lastEval.observations}&quot;</p>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
