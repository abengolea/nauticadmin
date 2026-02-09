"use client";

import { useUserProfile } from "@/firebase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Video } from "lucide-react";
import { useState } from "react";
import { RecordOrUploadVideoDialog } from "@/components/videos/RecordOrUploadVideoDialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function RecordVideoPage() {
  const { activeSchoolId, isReady } = useUserProfile();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!isReady) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!activeSchoolId) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          <Video className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>Selecciona una escuela para grabar o subir videos a la videoteca de los jugadores.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline">Grabar video</h1>
        <p className="text-muted-foreground mt-1">
          Añade videos a la videoteca de un jugador: graba con la cámara o sube un archivo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Videoteca de jugadores</CardTitle>
          <CardDescription>
            Elige un jugador y graba o sube un video para documentar habilidades y entrenamientos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setDialogOpen(true)} size="lg">
            <Video className="mr-2 h-5 w-5" />
            Grabar o subir video
          </Button>
        </CardContent>
      </Card>

      <RecordOrUploadVideoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schoolId={activeSchoolId}
        initialPlayerId={null}
        initialPlayerName=""
        embedded={false}
        onSuccess={() => setDialogOpen(false)}
      />
    </div>
  );
}
