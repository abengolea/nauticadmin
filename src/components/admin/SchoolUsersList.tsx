"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useCollection } from "@/firebase";
import type { SchoolUser } from "@/lib/types";
import { Skeleton } from "../ui/skeleton";
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Users, MoreHorizontal } from "lucide-react";
import { AddSchoolUserDialog } from "./AddSchoolUserDialog";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "../ui/dropdown-menu";

export function SchoolUsersList({ schoolId }: { schoolId: string }) {
  const { data: users, loading, error } = useCollection<SchoolUser>(`schools/${schoolId}/users`);

  const roleDisplay: { [key in SchoolUser['role']]: string } = {
    school_admin: 'Admin. de Escuela',
    coach: 'Entrenador'
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Usuarios de la Escuela
            </CardTitle>
            <CardDescription>
                {loading ? 'Cargando usuarios...' : `Hay ${users?.length || 0} usuarios asignados a esta escuela.`}
            </CardDescription>
        </div>
        <AddSchoolUserDialog schoolId={schoolId} />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && [...Array(2)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
              </TableRow>
            ))}
            {error && (
                <TableRow>
                    <TableCell colSpan={4} className="text-center text-destructive">
                        Error al cargar los usuarios.
                    </TableCell>
                </TableRow>
            )}
            {!loading && users?.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.displayName}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                    <Badge variant="secondary">{roleDisplay[user.role] || user.role}</Badge>
                </TableCell>
                <TableCell className="text-right">
                   <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Abrir menú</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                            <DropdownMenuItem disabled>Editar Rol</DropdownMenuItem>
                            <DropdownMenuItem disabled className="text-destructive">Revocar Acceso</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
             {!loading && (!users || users.length === 0) && (
                 <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No hay usuarios asignados a esta escuela.</TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
