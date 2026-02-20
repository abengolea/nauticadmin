"use client";

import { Search, Bell, LogOut, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth, useUser, useUserProfile, useCollection } from "@/firebase";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export function Header() {
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const { isReady, activeSchoolId, profile } = useUserProfile();
  // Solo staff (school_admin o coach) puede listar jugadores y pendingPlayers; nunca listar si es jugador.
  const isStaff = profile?.role === "school_admin" || profile?.role === "coach";
  const canListSchoolCollections = isReady && activeSchoolId && isStaff;
  const { data: pendingPlayers } = useCollection(
    canListSchoolCollections ? `schools/${activeSchoolId}/pendingPlayers` : "",
    {}
  );
  const { data: accessRequests } = useCollection(
    isReady ? "accessRequests" : "",
    { where: ["status", "==", "pending"] }
  );
  const solicitudesCount = (pendingPlayers?.length ?? 0) + (accessRequests?.length ?? 0);

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/auth/login');
  };

  return (
    <header className="flex h-14 items-center gap-2 sm:gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6 min-w-0">
       <div className="md:hidden shrink-0">
         <SidebarTrigger />
       </div>
      <div className="w-full flex-1 min-w-0">
        {isStaff && (
          <form>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar clientes..."
                className="w-full appearance-none bg-background pl-8 shadow-none md:w-2/3 lg:w-1/3"
              />
            </div>
          </form>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full relative">
            <Bell className="h-5 w-5" />
            {solicitudesCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-0.5 -right-0.5 h-5 min-w-5 rounded-full px-1 text-xs"
              >
                {solicitudesCount > 99 ? "99+" : solicitudesCount}
              </Badge>
            )}
            <span className="sr-only">Notificaciones y novedades</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Novedades
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {!activeSchoolId ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              Selecciona una escuela para ver novedades.
            </p>
          ) : solicitudesCount === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No hay novedades.
            </p>
          ) : (
            <>
              {solicitudesCount > 0 && (
                <DropdownMenuItem asChild>
                  <Link
                    href="/dashboard/registrations"
                    className="flex items-center gap-2 py-2"
                  >
                    <UserCheck className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <strong>{solicitudesCount}</strong> solicitud{solicitudesCount !== 1 ? "es" : ""} pendiente{solicitudesCount !== 1 ? "s" : ""}
                    </span>
                  </Link>
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" className="rounded-full">
            <Avatar className="h-8 w-8">
              {user?.photoURL ? (
                <AvatarImage src={user.photoURL} alt={user.displayName || "User"} />
              ) : null}
              <AvatarFallback>
                {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="sr-only">Alternar menú de usuario</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{user?.displayName || user?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
             <Link href="/dashboard/settings">Ajustes</Link>
          </DropdownMenuItem>
          <DropdownMenuItem>Soporte</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Cerrar Sesión</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
