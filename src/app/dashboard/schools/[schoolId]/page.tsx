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

export default function SchoolAdminPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.schoolId as string;
  const { isSuperAdmin, profile, isReady: profileReady } = useUserProfile();

  // This hook fetches the school's data, which is independent of user profile.
  const { data: school, loading: schoolLoading } = useDoc<School>(`schools/${schoolId}`);

  // Combine loading states: we need both profile and school data to be ready.
  const isLoading = schoolLoading || !profileReady;

  // Wait until all data is loaded before making an authorization decision.
  if (isLoading) {
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

  // Now that loading is complete, we can safely check for authorization.
  const canManageSchool = isSuperAdmin || (profile?.role === 'school_admin' && profile?.activeSchoolId === schoolId);

  if (!canManageSchool) {
    // If not authorized, redirect to the main dashboard.
    // We use router.replace to avoid adding a bad entry to the browser's history.
    router.replace('/dashboard');
    return null; // Render nothing while the redirect is happening.
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
