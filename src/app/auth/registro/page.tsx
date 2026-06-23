"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerRegistrationForm } from "@/components/registro/PlayerRegistrationForm";
import Link from "next/link";

export default function RegistroPage() {
  return (
    <Card className="w-full max-w-md min-w-0 shadow-2xl border-2 mx-auto">
      <CardHeader>
        <CardTitle className="text-xl sm:text-2xl font-headline">Registro de Cliente</CardTitle>
        <CardDescription>
          Elegí tu náutica, ingresá tu email dos veces y una contraseña. Un administrador revisará tu solicitud y te avisará cuando te aprueben.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PlayerRegistrationForm />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          ¿Ya tenés cuenta?{" "}
          <Link href="/auth/login" className="underline">
            Iniciar sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
