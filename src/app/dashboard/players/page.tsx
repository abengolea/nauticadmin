import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlusCircle } from "lucide-react";
import { PlayerTable } from "@/components/players/PlayerTable";
import Link from "next/link";

export default function PlayersPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Jugadores</h1>
        <div className="flex items-center space-x-2">
          <Button asChild>
            <Link href="/dashboard/players/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              Añadir Jugador
            </Link>
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Plantel de Jugadores</CardTitle>
          <CardDescription>Gestiona los jugadores de tu club y mira sus perfiles.</CardDescription>
        </CardHeader>
        <CardContent>
          <PlayerTable />
        </CardContent>
      </Card>
    </div>
  );
}
