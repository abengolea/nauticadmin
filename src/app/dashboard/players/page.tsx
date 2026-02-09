"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { useUserProfile } from "@/firebase";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlayersPage() {
  const router = useRouter();
  const { profile, isReady, activeSchoolId } = useUserProfile();
  const playerId = profile?.playerId;

  useEffect(() => {
    if (!isReady) return;
    if (profile?.role === "player" && activeSchoolId && playerId) {
      router.replace(`/dashboard/players/${playerId}?schoolId=${activeSchoolId}`);
    }
  }, [isReady, profile?.role, activeSchoolId, playerId, router]);

  if (isReady && profile?.role === "player") {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Skeleton className="h-10 w-1/3" />
      </div>
    );
  }

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
          <CardDescription>Gestiona los jugadores de tu escuela y mira sus perfiles.</CardDescription>
        </CardHeader>
        <CardContent>
          <PlayerTable />
        </CardContent>
      </Card>
    </div>
  );
}
