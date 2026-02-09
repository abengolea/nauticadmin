"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cake, User, Contact, Bot, FilePlus, ArrowLeft, UserX, ClipboardCheck, Video } from "lucide-react";
import { calculateAge } from "@/lib/utils";
import { useDoc, useUserProfile, useCollection } from "@/firebase";
import type { Player, Evaluation } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { SummaryTab } from "@/components/players/PlayerProfile/SummaryTab";
import { AnalyticsTab } from "@/components/players/PlayerProfile/AnalyticsTab";
import { useState } from "react";
import { AddEvaluationSheet } from "@/components/evaluations/AddEvaluationSheet";
import { EvaluationsTab } from "@/components/evaluations/EvaluationsTab";
import { PlayerVideoteca } from "@/components/videos/PlayerVideoteca";
import { AttendanceHistory } from "@/components/attendance/AttendanceHistory";
import { PhysicalAssessmentsTab } from "@/components/physical-assessments/PhysicalAssessmentsTab";
import { Activity } from "lucide-react";
import { EditPlayerDialog } from "@/components/players/EditPlayerDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function PlayerProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const { activeSchoolId, isReady: profileReady, profile } = useUserProfile();
  const isViewingAsPlayer = profile?.role === "player" && profile?.playerId === id;
  const [isEvalSheetOpen, setEvalSheetOpen] = useState(false);
  const [editingEvaluation, setEditingEvaluation] = useState<Evaluation | null>(null);
  const [isEditPlayerOpen, setEditPlayerOpen] = useState(false);

  const schoolIdFromQuery = searchParams.get('schoolId');
  const schoolId = schoolIdFromQuery || activeSchoolId;
  
  const { data: player, loading: playerLoading } = useDoc<Player>(
      profileReady && schoolId ? `schools/${schoolId}/players/${id}` : ''
  );

  const { data: evaluations, loading: evalsLoading, error: evalsError } = useCollection<Evaluation>(
    profileReady && schoolId ? `schools/${schoolId}/evaluations` : '',
    { where: ['playerId', '==', id], orderBy: ['date', 'desc'], limit: 20 }
  );

  const isLoading = playerLoading || !profileReady || evalsLoading;

  if (isLoading) {
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
            <Skeleton className="h-10 w-full max-w-md rounded-md" />
            <Skeleton className="h-64 w-full rounded-lg" />
        </div>
    );
  }

  if (!player) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16">
        <div className="rounded-full bg-muted p-4">
          <UserX className="h-12 w-12 text-muted-foreground" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Jugador no encontrado</h2>
          <p className="text-muted-foreground max-w-sm">
            {schoolId
              ? "No existe un jugador con este ID en la escuela seleccionada, o no tienes permiso para verlo."
              : "Falta el identificador de escuela. Entra desde la lista de jugadores de tu escuela."}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={schoolId ? `/dashboard/players?schoolId=${schoolId}` : "/dashboard/players"}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a jugadores
          </Link>
        </Button>
      </div>
    );
  }

  const playerWithSchool = { ...player, escuelaId: schoolId! };

  return (
    <>
    <AddEvaluationSheet
      playerId={id}
      schoolId={schoolId!}
      isOpen={isEvalSheetOpen}
      onOpenChange={(open) => {
        setEvalSheetOpen(open);
        if (!open) setEditingEvaluation(null);
      }}
      playerName={`${player.firstName ?? ""} ${player.lastName ?? ""}`.trim()}
      evaluationsSummary={evaluations?.map((e) => ({ date: e.date, coachComments: e.coachComments ?? "" })) ?? []}
      editingEvaluation={editingEvaluation}
    />
    <EditPlayerDialog
      player={player}
      schoolId={schoolId!}
      isOpen={isEditPlayerOpen}
      onOpenChange={setEditPlayerOpen}
    />
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row gap-6">
        <Avatar className="h-32 w-32 border-4 border-card">
          <AvatarImage src={player.photoUrl || undefined} data-ai-hint="person portrait" />
          <AvatarFallback className="text-4xl">
            {(player.firstName?.[0] || '')}{(player.lastName?.[0] || '')}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <Badge 
            variant={
              player.status === "active"
                ? "secondary"
                : "destructive"
            }
            className={`mb-2 capitalize ${player.status === "active" ? "border-green-600/50 bg-green-500/10 text-green-700 dark:text-green-400" : ""}`}
          >
            {player.status === 'active' ? 'Activo' : 'Inactivo'}
          </Badge>
          <h1 className="text-4xl font-bold font-headline">{player.firstName || ''} {player.lastName || ''}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
             {player.birthDate && <div className="flex items-center gap-1"><Cake className="h-4 w-4" /> {calculateAge(player.birthDate)} años</div>}
             {player.tutorContact?.name && <div className="flex items-center gap-1"><User className="h-4 w-4" /> Tutor: {player.tutorContact.name}</div>}
             {player.tutorContact?.phone && <div className="flex items-center gap-1"><Contact className="h-4 w-4" /> {player.tutorContact.phone}</div>}
          </div>
        </div>
        {!isViewingAsPlayer && (
        <div className="flex items-start gap-2">
            <Button variant="outline" onClick={() => setEditPlayerOpen(true)}>
              Editar Perfil
            </Button>
            <Button onClick={() => setEvalSheetOpen(true)}>
              <FilePlus className="mr-2 h-4 w-4" />
              Nueva Evaluación
            </Button>
        </div>
        )}
      </header>

      {!isViewingAsPlayer && !player.email && (
        <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Este jugador no puede iniciar sesión</AlertTitle>
          <AlertDescription>
            Falta completar el <strong>Email (acceso al panel)</strong> en Editar perfil. Sin ese email, al iniciar sesión verá &quot;Acceso Pendiente&quot;. Agregá el mismo email con el que el jugador se registra y guardá.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className={`grid w-full bg-card ${isViewingAsPlayer ? "grid-cols-5" : "grid-cols-6"}`}>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="evaluations">Evaluaciones</TabsTrigger>
          <TabsTrigger value="physical" className="gap-2">
            Físicas <Activity className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="videoteca" className="gap-2">
            Videoteca <Video className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2">
            Asistencia <ClipboardCheck className="h-4 w-4" />
          </TabsTrigger>
          {!isViewingAsPlayer && (
          <TabsTrigger value="analytics" className="gap-2">
            Análisis IA <Bot className="h-4 w-4" />
            <Badge variant="secondary" className="text-[10px] font-normal">En desarrollo</Badge>
          </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="summary">
          <SummaryTab player={playerWithSchool} />
        </TabsContent>
        <TabsContent value="evaluations">
          <EvaluationsTab
            playerId={id}
            schoolId={schoolId!}
            evaluations={evaluations}
            loading={evalsLoading}
            error={evalsError}
            onOpenCreate={() => setEvalSheetOpen(true)}
            onEditClick={(evalData) => {
              setEditingEvaluation(evalData);
              setEvalSheetOpen(true);
            }}
            isViewingAsPlayer={isViewingAsPlayer}
          />
        </TabsContent>
        <TabsContent value="physical">
          <PhysicalAssessmentsTab player={playerWithSchool} schoolId={schoolId!} isViewingAsPlayer={isViewingAsPlayer} />
        </TabsContent>
        <TabsContent value="videoteca">
          <PlayerVideoteca
            schoolId={schoolId!}
            playerId={id}
            playerName={`${player.firstName ?? ""} ${player.lastName ?? ""}`.trim()}
            embedded
            isViewingAsPlayer={isViewingAsPlayer}
          />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceHistory schoolId={schoolId!} playerId={id} />
        </TabsContent>
        {!isViewingAsPlayer && (
        <TabsContent value="analytics">
          <AnalyticsTab player={playerWithSchool} evaluations={evaluations || []} />
        </TabsContent>
        )}
      </Tabs>
    </div>
    </>
  );
}
