"use client";

import { notFound, useParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cake, Ruler, Scale, Shirt, Footprints, ArrowRightLeft } from "lucide-react";
import { SummaryTab } from "@/components/players/PlayerProfile/SummaryTab";
import { PhysicalTab } from "@/components/players/PlayerProfile/PhysicalTab";
import { TechnicalTab } from "@/components/players/PlayerProfile/TechnicalTab";
import { calculateAge } from "@/lib/utils";
import { TacticalTab } from "@/components/players/PlayerProfile/TacticalTab";
import { MedicalTab } from "@/components/players/PlayerProfile/MedicalTab";
import { useDoc } from "@/firebase";
import type { Player } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlayerProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const { data: player, loading } = useDoc<Player>(`players/${id}`);

  if (loading) {
    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row gap-6">
                <Skeleton className="h-32 w-32 rounded-full" />
                <div className="flex-1 space-y-3">
                    <Skeleton className="h-6 w-24 rounded" />
                    <Skeleton className="h-10 w-1/2 rounded" />
                    <Skeleton className="h-6 w-1/3 rounded" />
                     <div className="mt-4 flex items-center gap-4">
                        <Skeleton className="h-5 w-20 rounded" />
                        <Skeleton className="h-5 w-20 rounded" />
                        <Skeleton className="h-5 w-20 rounded" />
                     </div>
                </div>
            </header>
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-64 w-full rounded-lg" />
        </div>
    );
  }

  if (!player) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row gap-6">
        <Avatar className="h-32 w-32 border-4 border-card">
          <AvatarImage src={player.avatarUrl} data-ai-hint="person portrait" />
          <AvatarFallback className="text-4xl">{player.firstName[0]}{player.lastName[0]}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <Badge 
            variant={
              player.status === "activo"
                ? "secondary"
                : player.status === "lesionado"
                ? "destructive"
                : "outline"
            }
            className={`mb-2 capitalize ${player.status === "activo" ? "border-green-600/50 bg-green-500/10 text-green-700 dark:text-green-400" : ""}`}
          >
            {player.status}
          </Badge>
          <h1 className="text-4xl font-bold font-headline">{player.firstName} {player.lastName}</h1>
          <p className="text-xl text-muted-foreground">{player.primaryPosition} • {player.category}</p>
          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
             <div className="flex items-center gap-1"><Cake className="h-4 w-4" /> {calculateAge(player.birthDate)} años</div>
             <div className="flex items-center gap-1"><Ruler className="h-4 w-4" /> {player.height} cm</div>
             <div className="flex items-center gap-1"><Scale className="h-4 w-4" /> {player.weight} kg</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
            <Button>Editar Perfil</Button>
            <Button variant="outline">Generar Informe</Button>
        </div>
      </header>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-card">
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="physical">Físico</TabsTrigger>
          <TabsTrigger value="technical">Técnico</TabsTrigger>
          <TabsTrigger value="tactical">Táctico</TabsTrigger>
          <TabsTrigger value="medical">Médico</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <SummaryTab player={player} />
        </TabsContent>
        <TabsContent value="physical">
          <PhysicalTab player={player} />
        </TabsContent>
        <TabsContent value="technical">
          <TechnicalTab player={player} />
        </TabsContent>
        <TabsContent value="tactical">
          <TacticalTab player={player} />
        </TabsContent>
        <TabsContent value="medical">
           <MedicalTab player={player} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
