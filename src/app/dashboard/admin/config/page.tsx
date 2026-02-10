"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Settings } from "lucide-react";
import { useFirestore, useUserProfile, useDoc } from "@/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import type { PlatformConfig } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { writeAuditLog } from "@/lib/audit";

const CONFIG_DOC_ID = "settings";

export default function PlatformConfigPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { user, profile, isSuperAdmin, isReady } = useUserProfile();
  const { data: config, loading } = useDoc<PlatformConfig & { id: string }>(
    `platformConfig/${CONFIG_DOC_ID}`
  );
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  useEffect(() => {
    if (!isReady) return;
    if (!isSuperAdmin) {
      router.replace("/dashboard");
      return;
    }
  }, [isReady, isSuperAdmin, router]);

  useEffect(() => {
    if (config) {
      setMaintenanceMode(config.maintenanceMode ?? false);
      setMaintenanceMessage(config.maintenanceMessage ?? "");
      setRegistrationEnabled(config.registrationEnabled ?? true);
    }
  }, [config]);

  const handleSave = async () => {
    if (!user?.uid || !user?.email) return;
    setSaving(true);
    try {
      const ref = doc(firestore, "platformConfig", CONFIG_DOC_ID);
      await setDoc(
        ref,
        {
          maintenanceMode,
          maintenanceMessage: maintenanceMessage.trim() || null,
          registrationEnabled,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );
      await writeAuditLog(firestore, user.email, user.uid, {
        action: "platform_config.update",
        resourceType: "platformConfig",
        resourceId: CONFIG_DOC_ID,
        details: `maintenanceMode=${maintenanceMode}, registrationEnabled=${registrationEnabled}`,
      });
      toast({
        title: "Configuración guardada",
        description: "Los cambios se aplicaron correctamente.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo guardar.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isReady || !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-2">
          <Settings className="h-8 w-8" />
          Configuración global
        </h1>
        <p className="text-muted-foreground">
          Ajustes de la plataforma (solo super administrador).
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Mantenimiento y registro</CardTitle>
            <CardDescription>
              Modo mantenimiento muestra un mensaje a los usuarios. El registro web controla si se permiten nuevas inscripciones desde la web.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="maintenance-mode">Modo mantenimiento</Label>
              <Switch
                id="maintenance-mode"
                checked={maintenanceMode}
                onCheckedChange={setMaintenanceMode}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-message">Mensaje de mantenimiento</Label>
              <Textarea
                id="maintenance-message"
                placeholder="La plataforma está en mantenimiento. Volvemos pronto."
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="registration-enabled">Registro web habilitado</Label>
              <Switch
                id="registration-enabled"
                checked={registrationEnabled}
                onCheckedChange={setRegistrationEnabled}
              />
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Guardar cambios
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
