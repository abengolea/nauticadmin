"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserX, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/firebase";
import { signOut } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";

export default function PendingApprovalPage() {
  const router = useRouter();
  const auth = useAuth();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/auth/login');
      toast({
        title: "Sesión cerrada",
        description: "Has cerrado sesión exitosamente.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cerrar la sesión. Inténtalo de nuevo.",
      });
    }
  };

  const handleRetry = () => {
    // Just reload the page, which will re-trigger the profile check
    window.location.reload();
  }

  return (
    <Card className="w-full max-w-md shadow-2xl border-2">
      <CardHeader className="items-center text-center">
        <UserX className="h-16 w-16 text-destructive" />
        <CardTitle className="text-2xl font-headline mt-4">Acceso Pendiente</CardTitle>
        <CardDescription>
          Tu cuenta está activa, pero no tienes permisos para acceder.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <p className="text-muted-foreground">
          Un administrador necesita asignarte a una escuela y darte un rol (ej. Entrenador). Una vez que lo hagan, podrás acceder al panel.
        </p>
        <div className="flex flex-col gap-2">
            <Button onClick={handleRetry} className="w-full">
                Reintentar
            </Button>
            <Button onClick={handleLogout} variant="outline" className="w-full">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </Button>
        </div>
      </CardContent>
    </Card>
  );
}
