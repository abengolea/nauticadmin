"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useDoc, useUserProfile, useFirebase } from "@/firebase";
import { getAuth } from "firebase/auth";
import type { School } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Shield, Users, Clock, FileSpreadsheet, Banknote, Pencil, GitMerge, Mail, Loader2, FileText, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { SchoolUsersList } from "@/components/admin/SchoolUsersList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayerTable } from "@/components/players/PlayerTable";
import { AppointmentConfigForm } from "@/components/appointments/AppointmentConfigForm";
import { AppointmentsList } from "@/components/appointments/AppointmentsList";
import { ImportClientsFromExcel } from "@/components/clients/ImportClientsFromExcel";
import { ImportClienteDesde } from "@/components/clients/ImportClienteDesde";
import { ImportPaymentsFromExcel } from "@/components/payments/ImportPaymentsFromExcel";
import { ImportUsuarioId } from "@/components/clients/ImportUsuarioId";
import { BoatPricingConfigForm } from "@/components/boat-pricing/BoatPricingConfigForm";
import { EditSchoolDialog } from "@/components/admin/EditSchoolDialog";
import { SchoolFacturacionTab } from "@/components/admin/SchoolFacturacionTab";

const VALID_TABS = ["users", "players", "precios", "importar", "turnos", "facturacion", "probar-email"] as const;

export default function SchoolAdminPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const schoolId = params.schoolId as string;
  const tabFromUrl = searchParams.get("tab");
  const defaultTab = (VALID_TABS.includes(tabFromUrl as (typeof VALID_TABS)[number]) ? tabFromUrl : "users") as string;
  const { app } = useFirebase();
  const { isSuperAdmin, profile, isReady: profileReady } = useUserProfile();
  const { toast } = useToast();
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [syncingWhatsApp, setSyncingWhatsApp] = useState(false);

  const { data: school, loading: schoolLoading } = useDoc<School>(`schools/${schoolId}`);

  const isLoading = schoolLoading || !profileReady;
  // Solo el admin de la náutica puede ver/gestinar; el super admin no accede a cosas internas
  const canManageSchool = profile?.role === 'school_admin' && profile?.activeSchoolId === schoolId;

  useEffect(() => {
    // Only perform redirect logic after loading is complete and if the user is not authorized.
    if (!isLoading && !canManageSchool) {
      router.replace('/dashboard');
    }
  }, [isLoading, canManageSchool, router]);

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const to = testEmail.trim().toLowerCase();
    if (!to || !to.includes("@")) {
      toast({ variant: "destructive", title: "Email inválido", description: "Ingresá un correo válido." });
      return;
    }
    setSendingTest(true);
    try {
      const auth = getAuth(app);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast({ variant: "destructive", title: "No estás logueado." });
        setSendingTest(false);
        return;
      }
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/admin/test-email", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to, schoolId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ variant: "destructive", title: "Error", description: data.error || `Error ${res.status}` });
        setSendingTest(false);
        return;
      }
      toast({ title: "Email de prueba enviado", description: "Revisá la bandeja de entrada (y spam)." });
      setTestEmail("");
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "No se pudo enviar." });
    } finally {
      setSendingTest(false);
    }
  };

  const handleSyncWhatsApp = async () => {
    setSyncingWhatsApp(true);
    try {
      const auth = getAuth(app);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast({ variant: "destructive", title: "No estás logueado." });
        return;
      }
      const token = await currentUser.getIdToken();
      const res = await fetch(`/api/admin/schools/${schoolId}/sync-whatsapp-memberships`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const desc = res.status === 503
          ? "Configurá NOTIFICASHUB_PROJECT_ID, NOTIFICASHUB_CLIENT_EMAIL, NOTIFICASHUB_PRIVATE_KEY en App Hosting."
          : (data.error ?? `Error ${res.status}`);
        toast({ variant: "destructive", title: "Error", description: desc });
        return;
      }
      toast({
        title: "WhatsApp sincronizado",
        description: `${data.membershipsUpdated ?? 0} números actualizados. ${data.playersWithPhone ?? 0} clientes con teléfono.`,
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "No se pudo sincronizar." });
    } finally {
      setSyncingWhatsApp(false);
    }
  };
  
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
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <Button variant="outline" size="icon" asChild className="shrink-0">
          <Link href="/dashboard">
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Volver al panel</span>
          </Link>
        </Button>
        {school?.logoUrl && (
          <img
            src={school.logoUrl}
            alt={school.name}
            className="h-10 w-10 object-contain rounded shrink-0"
          />
        )}
        <h1 className="text-xl font-bold tracking-tight font-headline truncate sm:text-3xl">
            Gestión de: {school?.name}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          {school && (
            <EditSchoolDialog school={school}>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-2" />
                Editar datos
              </Button>
            </EditSchoolDialog>
          )}
        </div>
      </div>
      
      {!school ? (
        <Card>
            <CardHeader>
                <CardTitle>Náutica no encontrada</CardTitle>
                <CardDescription>La náutica que buscas no existe o fue eliminada.</CardDescription>
            </CardHeader>
        </Card>
      ) : (
        <Tabs defaultValue={defaultTab} className="w-full" key={defaultTab}>
            <TabsList className="flex w-full flex-wrap gap-1 p-1 h-auto min-h-10 bg-card">
                <TabsTrigger value="users" className="text-xs px-2 py-2 gap-1 md:text-sm md:px-3 md:py-1.5 md:gap-2 shrink-0">
                    <Shield className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                    <span className="truncate">Responsables</span>
                </TabsTrigger>
                <TabsTrigger value="players" className="text-xs px-2 py-2 gap-1 md:text-sm md:px-3 md:py-1.5 md:gap-2 shrink-0">
                    <Users className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                    <span className="truncate">Clientes</span>
                </TabsTrigger>
                <TabsTrigger value="precios" className="text-xs px-2 py-2 gap-1 md:text-sm md:px-3 md:py-1.5 md:gap-2 shrink-0">
                    <Banknote className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                    <span className="truncate">Precios</span>
                </TabsTrigger>
                <TabsTrigger value="importar" className="text-xs px-2 py-2 gap-1 md:text-sm md:px-3 md:py-1.5 md:gap-2 shrink-0">
                    <FileSpreadsheet className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                    <span className="truncate">Importar</span>
                </TabsTrigger>
                <TabsTrigger value="turnos" className="text-xs px-2 py-2 gap-1 md:text-sm md:px-3 md:py-1.5 md:gap-2 shrink-0">
                    <Clock className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                    <span className="truncate">Turnos</span>
                </TabsTrigger>
                <TabsTrigger value="facturacion" className="text-xs px-2 py-2 gap-1 md:text-sm md:px-3 md:py-1.5 md:gap-2 shrink-0">
                    <FileText className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                    <span className="truncate">Facturación</span>
                </TabsTrigger>
                <TabsTrigger value="probar-email" className="text-xs px-2 py-2 gap-1 md:text-sm md:px-3 md:py-1.5 md:gap-2 shrink-0">
                    <Mail className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                    <span className="truncate">Probar email</span>
                </TabsTrigger>
                <Link
                  href="/dashboard/reconciliation"
                  className="inline-flex items-center justify-center gap-1 rounded-sm px-2 py-2 md:px-3 md:py-1.5 text-xs md:text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors shrink-0"
                >
                  <GitMerge className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                  <span className="truncate">Conciliación</span>
                </Link>
            </TabsList>
            <TabsContent value="users">
                <SchoolUsersList schoolId={schoolId} />
            </TabsContent>
            <TabsContent value="precios" className="space-y-4">
                <BoatPricingConfigForm schoolId={schoolId} />
            </TabsContent>
            <TabsContent value="players">
                 <Card>
                    <CardHeader className="pb-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <CardTitle className="text-lg sm:text-xl">Listado de Clientes</CardTitle>
                            <CardDescription className="text-sm">Gestiona los clientes de esta náutica. Si agregaste teléfonos nuevos, sincronizá con WhatsApp para que puedan recibir mensajes.</CardDescription>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSyncWhatsApp}
                            disabled={syncingWhatsApp}
                            className="shrink-0"
                          >
                            {syncingWhatsApp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageCircle className="h-4 w-4 mr-2" />}
                            Sincronizar WhatsApp
                          </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 sm:p-6">
                        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                            <PlayerTable schoolId={schoolId} />
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="importar" className="space-y-6 overflow-y-auto">
                <ImportUsuarioId schoolId={schoolId} />
                <ImportPaymentsFromExcel schoolId={schoolId} />
                <ImportClienteDesde schoolId={schoolId} />
                <ImportClientsFromExcel schoolId={schoolId} />
            </TabsContent>
            <TabsContent value="turnos" className="space-y-4">
                <AppointmentConfigForm schoolId={schoolId} />
                <AppointmentsList schoolId={schoolId} />
            </TabsContent>
            <TabsContent value="facturacion" className="space-y-4">
                <SchoolFacturacionTab school={school} key={school.id} />
            </TabsContent>
            <TabsContent value="probar-email">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Mail className="h-5 w-5" />
                            Probar Trigger Email
                        </CardTitle>
                        <CardDescription>
                            Enviá un correo de prueba para verificar que la extensión Trigger Email funciona. Revisá también la carpeta de spam.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSendTestEmail} className="flex flex-wrap items-end gap-2">
                            <div className="flex-1 min-w-[200px] space-y-2">
                                <Label htmlFor="test-email-school">Email de destino</Label>
                                <Input
                                    id="test-email-school"
                                    type="email"
                                    placeholder="tu@email.com"
                                    value={testEmail}
                                    onChange={(e) => setTestEmail(e.target.value)}
                                    disabled={sendingTest}
                                />
                            </div>
                            <Button type="submit" disabled={sendingTest}>
                                {sendingTest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                                Enviar prueba
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
