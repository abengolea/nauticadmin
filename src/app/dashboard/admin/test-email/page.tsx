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
import { Loader2, Mail } from "lucide-react";
import { useUserProfile, useFirebase } from "@/firebase";
import { getAuth } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";

export default function TestEmailPage() {
  const router = useRouter();
  const { app } = useFirebase();
  const { isSuperAdmin, isReady } = useUserProfile();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (!isSuperAdmin) {
      router.replace("/dashboard");
      return;
    }
  }, [isReady, isSuperAdmin, router]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const to = email.trim().toLowerCase();
    if (!to || !to.includes("@")) {
      toast({
        variant: "destructive",
        title: "Email inválido",
        description: "Ingresá un correo válido.",
      });
      return;
    }
    setSending(true);
    try {
      const auth = getAuth(app);
      const user = auth.currentUser;
      if (!user) {
        toast({ variant: "destructive", title: "No estás logueado." });
        setSending(false);
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/test-email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Error",
          description: data.error || `Error ${res.status}`,
        });
        setSending(false);
        return;
      }
      toast({
        title: "Email de prueba enviado",
        description: data.message || "Revisá la bandeja de entrada (y spam) del correo indicado.",
      });
      setEmail("");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo enviar.",
      });
    } finally {
      setSending(false);
    }
  };

  if (!isReady || !isSuperAdmin) {
    return null;
  }

  return (
    <div className="container max-w-lg py-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            <CardTitle>Probar Trigger Email</CardTitle>
          </div>
          <CardDescription>
            Envía un correo de prueba a la colección <code className="text-xs bg-muted px-1 rounded">mail</code>.
            Si la extensión Trigger Email está configurada, el correo llegará al destinatario. Revisá también la carpeta de spam.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-email">Email de destino</Label>
              <Input
                id="test-email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={sending}
              />
            </div>
            <Button type="submit" disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar email de prueba"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
