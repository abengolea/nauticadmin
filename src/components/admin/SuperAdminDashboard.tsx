"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building } from "lucide-react";
import { useCollection } from "@/firebase";
import type { School } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { es } from 'date-fns/locale';
import { Badge } from "../ui/badge";
import { CreateSchoolDialog } from "./CreateSchoolDialog";

export function SuperAdminDashboard() {
    const { data: schools, loading: schoolsLoading } = useCollection<School>('schools', { orderBy: ['createdAt', 'desc']});

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight font-headline">Panel de Super Administrador</h1>
                    <p className="text-muted-foreground">Gestiona todas las escuelas de la plataforma.</p>
                </div>
                <div className="flex items-center space-x-2">
                    <CreateSchoolDialog />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building className="h-5 w-5" />
                        Todas las Escuelas
                    </CardTitle>
                    <CardDescription>
                        {schools ? `${schools.length} escuelas registradas en la plataforma.` : 'Cargando listado de escuelas...'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nombre de la Escuela</TableHead>
                                <TableHead>Ubicación</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Fecha de Creación</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {schoolsLoading && [...Array(3)].map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-16 ml-auto" /></TableCell>
                                </TableRow>
                            ))}
                            {schools?.map((school) => (
                                <TableRow key={school.id}>
                                    <TableCell className="font-medium">{school.name}</TableCell>
                                    <TableCell>{school.city}, {school.province}</TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={school.status === 'active' ? 'secondary' : 'destructive'}
                                            className={`capitalize ${school.status === "active" ? "border-green-600/50 bg-green-500/10 text-green-700 dark:text-green-400" : ""}`}
                                        >
                                            {school.status === 'active' ? 'Activa' : 'Suspendida'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{format(school.createdAt, 'dd/MM/yyyy', { locale: es })}</TableCell>
                                    <TableCell className="text-right">
                                        {/* Acciones futuras como "Gestionar" irán aquí */}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                     {(!schoolsLoading && !schools?.length) && (
                        <p className="text-center text-muted-foreground py-8">No hay escuelas para mostrar.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
