"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlusCircle, Users, School } from "lucide-react";
import Link from "next/link";
import { useCollection, useUserProfile, useDoc, useFirebase } from "@/firebase";
import { getAuth } from "firebase/auth";
import type { Player, School as SchoolType } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import React, { useMemo, useCallback } from "react";
import { DashboardStats } from "./DashboardStats";

export function SchoolAdminDashboard() {
  const { profile, isReady, activeSchoolId } = useUserProfile();
  const { app } = useFirebase();

  const getToken = useCallback(async () => {
    if (!app) return null;
    const user = getAuth(app).currentUser;
    return user?.getIdToken?.() ?? null;
  }, [app]);
  
  const { data: school, loading: schoolLoading } = useDoc<SchoolType>(
    activeSchoolId ? `schools/${activeSchoolId}` : ''
  );

  const { data: players, loading: playersLoading } = useCollection<Player>(
      activeSchoolId ? `schools/${activeSchoolId}/players` : '',
      {}
  );

  const activePlayers = useMemo(() => (players ?? []).filter((p) => !p.archived), [players]);

  const isLoading = !isReady || schoolLoading || playersLoading;

  if (isLoading) {
    return (
       <div className="flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Panel Principal</h1>
        </div>
         <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Clientes Activos</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-8 w-1/4" />
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Sede</CardTitle>
                    <School className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                     <Skeleton className="h-8 w-3/4" />
                </CardContent>
            </Card>
         </div>
          <div className="grid gap-4 md:grid-cols-1">
            <Card>
                <CardHeader>
                    <CardTitle>Actividad Reciente</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground p-4">No hay actividad reciente para mostrar.</p>
                </CardContent>
            </Card>
          </div>
       </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between space-y-2">
        <div>
            <h1 className="text-3xl font-bold tracking-tight font-headline">Panel de {profile?.role === 'school_admin' ? 'Administración' : 'Entrenador'}</h1>
            <p className="text-muted-foreground">Bienvenido, {profile?.displayName}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/players/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Añadir Cliente
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Activos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activePlayers.filter(p => p.status === 'active').length}</div>
            <p className="text-xs text-muted-foreground">
              {activePlayers.length} en total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sede Actual</CardTitle>
            <School className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{school?.name || 'Sede no encontrada'}</div>
            <p className="text-xs text-muted-foreground">
              {school?.city || ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {activeSchoolId && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Resumen del mes</h2>
          <DashboardStats schoolId={activeSchoolId} getToken={getToken} />
        </div>
      )}
    </div>
  );
}
