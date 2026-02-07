"use client";

import { AddPlayerForm } from "@/components/players/AddPlayerForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NewPlayerPage() {
  return (
    <div className="flex flex-col gap-4">
       <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/dashboard/players">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight font-headline">Añadir Nuevo Jugador</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Formulario de Registro de Jugador</CardTitle>
          <CardDescription>
            Completa los detalles a continuación para añadir un nuevo jugador al sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <AddPlayerForm />
        </CardContent>
      </Card>
    </div>
  );
}
