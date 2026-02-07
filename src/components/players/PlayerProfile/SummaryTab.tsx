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
                    <CardTitle className="font-headline">Key Information</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableBody>
                            <TableRow>
                                <TableCell className="font-medium text-muted-foreground">Full Name</TableCell>
                                <TableCell className="text-right">{player.firstName} {player.lastName}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell className="font-medium text-muted-foreground">Position</TableCell>
                                <TableCell className="text-right">{player.primaryPosition}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell className="font-medium text-muted-foreground">Category</TableCell>
                                <TableCell className="text-right">{player.category}</TableCell>
                            </TableRow>
                             <TableRow>
                                <TableCell className="font-medium text-muted-foreground">Status</TableCell>
                                <TableCell className="text-right capitalize">{player.status}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Recent Activity</CardTitle>
                    <CardDescription>Last session and medical update.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                   <div className="flex items-start gap-4">
                        <div className="rounded-md bg-secondary p-2">
                           <p className="text-sm font-bold text-secondary-foreground">{lastSession.date.getDate()}</p>
                           <p className="text-xs text-secondary-foreground">{lastSession.date.toLocaleString('default', { month: 'short' })}</p>
                        </div>
                        <div>
                            <p className="font-semibold">Last Session: {lastSession.type}</p>
                            <p className="text-sm text-muted-foreground">Category: {lastSession.category}</p>
                        </div>
                   </div>
                   <div className="flex items-start gap-4">
                        <div className="rounded-md bg-destructive/20 p-2">
                           <p className="text-sm font-bold text-destructive">{lastInjury.injuryDate.getDate()}</p>
                           <p className="text-xs text-destructive">{lastInjury.injuryDate.toLocaleString('default', { month: 'short' })}</p>
                        </div>
                        <div>
                            <p className="font-semibold">Medical Update: {lastInjury.status}</p>
                            <p className="text-sm text-muted-foreground">Part: {lastInjury.bodyPart}</p>
                        </div>
                   </div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Individual Goals</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Goals would be listed here */}
                    <p className="text-muted-foreground text-sm">No goals set.</p>
                </CardContent>
            </Card>
        </div>
    );
}
