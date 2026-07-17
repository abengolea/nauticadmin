"use client";

import { useState } from "react";
import { useFirestore, useCollection, useDoc } from "@/firebase";
import type { Player, School } from "@/lib/types";
import { buildEmailHtml, escapeHtml, htmlToPlainText, sendMailDoc } from "@/lib/email";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Mail, Loader2 } from "lucide-react";

interface NovedadesMailCardProps {
  schoolId: string;
  schoolName: string;
}

export function NovedadesMailCard({ schoolId, schoolName }: NovedadesMailCardProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { data: school } = useDoc<School>(schoolId ? `schools/${schoolId}` : "");
  const brandName = school?.name?.trim() || schoolName || "NauticAdmin";
  const logoUrl = school?.logoUrl?.trim() || undefined;
  const { data: playersData, loading: playersLoading } = useCollection<Player>(
    schoolId ? `schools/${schoolId}/players` : ""
  );
  const players = (playersData ?? []).filter((p) => !p.archived);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const withEmail = players.filter((p) => p.email?.trim());
  const withoutEmail = players.length - withEmail.length;

  const handleSendAll = async () => {
    const subj = subject.trim();
    const text = body.trim();
    if (!subj || !text) {
      toast({
        variant: "destructive",
        title: "Faltan datos",
        description: "Completá asunto y mensaje.",
      });
      return;
    }
    if (withEmail.length === 0) {
      toast({
        variant: "destructive",
        title: "Sin destinatarios",
        description: "Ningún cliente tiene email cargado. Agregá emails en los perfiles.",
      });
      return;
    }
    setSending(true);
    let sent = 0;
    let failed = 0;
    try {
      for (const player of withEmail) {
        try {
          const firstName = player.firstName ?? "cliente";
          const contentHtml = `<p>Hola <strong>${escapeHtml(firstName)}</strong>,</p><p>${escapeHtml(text).replace(/\n/g, "</p><p>")}</p>`;
          const html = buildEmailHtml(contentHtml, {
            brandName,
            logoUrl,
            title: brandName,
            greeting: `Novedad de ${brandName}.`,
            baseUrl: typeof window !== "undefined" ? window.location.origin : "",
          });
          await sendMailDoc(firestore, {
            to: player.email!,
            subject: subj,
            html,
            text: htmlToPlainText(contentHtml),
          });
          sent++;
        } catch {
          failed++;
        }
      }
      toast({
        title: "Mensajes encolados",
        description: `Se enviarán ${sent} correos${failed > 0 ? `. ${failed} fallaron.` : "."}`,
      });
      setSubject("");
      setBody("");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Novedades por correo
        </CardTitle>
        <CardDescription>
          Escribí un mensaje y enviá un correo a todos los clientes de la náutica que tengan email cargado.
          {playersLoading ? (
            " Cargando clientes..."
          ) : (
            <> {withEmail.length} clientes con email{withoutEmail > 0 ? ` (${withoutEmail} sin email)` : ""}.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="novedad-subject">Asunto</Label>
          <Input
            id="novedad-subject"
            placeholder="Ej: Cambio de horario del sábado"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={sending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="novedad-body">Mensaje</Label>
          <Textarea
            id="novedad-body"
            placeholder="Escribí el texto que quieras comunicar a todos los clientes..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            disabled={sending}
            className="resize-y"
          />
        </div>
        <Button
          onClick={handleSendAll}
          disabled={sending || withEmail.length === 0 || playersLoading}
        >
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}
          {sending ? "Enviando…" : `Enviar a ${withEmail.length} clientes`}
        </Button>
      </CardContent>
    </Card>
  );
}
