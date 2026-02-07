"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowUpRight, Calendar, HeartPulse, PlusCircle, Users } from "lucide-react";
import Link from "next/link";
import { sessions } from "@/lib/mock-data";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCollection } from "@/firebase";
import type { Player } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { data: players, loading } = useCollection<Player>('players');
  const upcomingSession = sessions[0];

  if (loading) {
    return (
       <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Panel Principal</h1>
        </div>
         <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Jugadores Activos</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-8 w-1/4" />
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Jugadores Lesionados</CardTitle>
                    <HeartPulse className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                     <Skeleton className="h-8 w-1/4" />
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Próxima Sesión</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold capitalize">{upcomingSession.type}</div>
                    <p className="text-xs text-muted-foreground">
                    {upcomingSession.date.toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Cumplimiento</CardTitle>
                    <CardTitle className="text-sm font-medium text-accent">92%</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">Objetivos</div>
                    <p className="text-xs text-muted-foreground">
                    Objetivos de jugadores en curso
                    </p>
                </CardContent>
            </Card>
         </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>Actividad Reciente</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground p-4">No hay actividad reciente para mostrar.</p>
                </CardContent>
            </Card>
             <Card className="col-span-3">
                <CardHeader>
                    <CardTitle>Jugadores en Seguimiento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
          </div>
       </div>
    );
  }

  const activePlayers = players?.filter(p => p.status === 'activo').length || 0;
  const injuredPlayers = players?.filter(p => p.status === 'lesionado').length || 0;


  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Panel Principal</h1>
        <div className="flex items-center space-x-2">
          <Button asChild>
            <Link href="/dashboard/players/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Nueva Evaluación
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jugadores Activos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activePlayers}</div>
            <p className="text-xs text-muted-foreground">
              +2 desde el mes pasado
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jugadores Lesionados</CardTitle>
            <HeartPulse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{injuredPlayers}</div>
            <p className="text-xs text-muted-foreground">
              1 recuperación pendiente
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próxima Sesión</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{upcomingSession.type}</div>
            <p className="text-xs text-muted-foreground">
              {upcomingSession.date.toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cumplimiento</CardTitle>
            <CardTitle className="text-sm font-medium text-accent">92%</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Objetivos</div>
            <p className="text-xs text-muted-foreground">
              Objetivos de jugadores en curso
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
            <CardDescription>
              Resumen de evaluaciones y actualizaciones recientes.
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            {/* This would be a list of recent activities */}
            <p className="text-sm text-muted-foreground p-4">No hay actividad reciente para mostrar.</p>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Jugadores en Seguimiento</CardTitle>
            <CardDescription>
              Jugadores que requieren atención o seguimiento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {players?.slice(0, 4).map((player) => (
                <div key={player.id} className="flex items-center">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={player.avatarUrl} alt="Avatar" data-ai-hint="person portrait" />
                    <AvatarFallback>{player.firstName[0]}{player.lastName[0]}</AvatarFallback>
                  </Avatar>
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">{player.firstName} {player.lastName}</p>
                    <p className="text-sm text-muted-foreground">{player.primaryPosition}</p>
                  </div>
                  <Link href={`/dashboard/players/${player.id}`} className="ml-auto">
                    <Button variant="ghost" size="sm">
                       Ver <ArrowUpRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
