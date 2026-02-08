"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useDoc, useUserProfile } from "@/firebase";
import type { School } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SchoolUsersList } from "@/components/admin/SchoolUsersList";
import { SchoolCategoriesManager } from "@/components/admin/SchoolCategoriesManager";
import { useEffect } from "react";

export default function SchoolAdminPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.schoolId as string;
  const { isSuperAdmin, profile, isReady: profileReady } = useUserProfile();

  const { data: school, loading: schoolLoading } = useDoc<School>(`schools/${schoolId}`);

  const isLoading = schoolLoading || !profileReady;
  const canManageSchool = isSuperAdmin || (profile?.role === 'school_admin' && profile?.activeSchoolId === schoolId);

  useEffect(() => {
    // Only perform redirect logic after loading is complete and if the user is not authorized.
    if (!isLoading && !canManageSchool) {
      router.replace('/dashboard');
    }
  }, [isLoading, canManageSchool, router]);
  
  // While loading, or if the user is not authorized (and is about to be redirected), show a loading skeleton.
  // This prevents a flash of unauthorized content.
  if (isLoading || !canManageSchool) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-8 w-1/3" />
        </div>
        <div className="space-y-4">
            <Card>
                <CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader>
                <CardContent><Skeleton className="h-40 w-full" /></CardContent>
            </Card>
            <Card>
                <CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader>
                <CardContent><Skeleton className="h-40 w-full" /></CardContent>
            </Card>
        </div>
      </div>
    );
  }

  // User is authorized and data is loaded, so render the page.
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/dashboard">
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Volver al panel</span>
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight font-headline">
            Gestión de: {school?.name}
        </h1>
      </div>
      
      {!school ? (
        <Card>
            <CardHeader>
                <CardTitle>Escuela no encontrada</CardTitle>
                <CardDescription>La escuela que buscas no existe o fue eliminada.</CardDescription>
            </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
            <SchoolUsersList schoolId={schoolId} />
            <SchoolCategoriesManager schoolId={schoolId} />
        </div>
      )}
    </div>
  );
}
