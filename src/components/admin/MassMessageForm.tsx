"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile, useCollection, useFirestore, useDoc, useUser } from "@/firebase";
import type { Player, School } from "@/lib/types";
import type { BoatPricingConfig } from "@/lib/types/boat-pricing";
import {
  getDefaultBoatPricingItems,
  splitPricingItems,
} from "@/lib/types/boat-pricing";
import { getPlayerEmbarcaciones } from "@/lib/utils";
import { formatPlayerName, playerNameSearchText } from "@/lib/format-player-name";
import { buildEmailHtml, htmlToPlainText, sendMailDoc } from "@/lib/email";
import { Mail, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

type AudienceMode =
  | "all"
  | "mora"
  | "with_boats"
  | "boat_group"
  | "specific";

const AUDIENCE_OPTIONS: { value: AudienceMode; label: string }[] = [
  { value: "all", label: "Todos los clientes con email" },
  { value: "mora", label: "En mora / suspendidos" },
  { value: "with_boats", label: "Con embarcación cargada" },
  { value: "boat_group", label: "Por tipo de embarcación" },
  { value: "specific", label: "Cliente(s) específico(s)" },
];

function playersWithEmail(players: Player[]): Player[] {
  return players.filter((p) => p.email?.trim());
}

function playerHasBoat(player: Player): boolean {
  return getPlayerEmbarcaciones(player).length > 0;
}

function playerMatchesBoatGroup(
  player: Player,
  group: string,
  itemsById: Map<string, { group: string; label: string }>
): boolean {
  const boats = getPlayerEmbarcaciones(player);
  return boats.some((b) => {
    if (!b.claseId) return false;
    const item = itemsById.get(b.claseId);
    return item?.group === group;
  });
}

export function MassMessageForm() {
  const { profile, activeSchoolId } = useUserProfile();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const { data: school } = useDoc<School>(
    activeSchoolId ? `schools/${activeSchoolId}` : ""
  );
  const brandName = school?.name?.trim() || "NauticAdmin";
  const logoUrl = school?.logoUrl?.trim() || undefined;

  const { data: boatPricing } = useDoc<BoatPricingConfig & { id: string }>(
    activeSchoolId ? `schools/${activeSchoolId}/boatPricingConfig/default` : ""
  );

  const { data: playersData, loading: playersLoading } = useCollection<Player>(
    activeSchoolId ? `schools/${activeSchoolId}/players` : "",
    {}
  );
  const players = (Array.isArray(playersData) ? playersData : []).filter((p) => !p.archived);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const [audience, setAudience] = useState<AudienceMode>("all");
  const [boatGroup, setBoatGroup] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clientSearch, setClientSearch] = useState("");
  const [delinquentIds, setDelinquentIds] = useState<Set<string>>(new Set());
  const [moraLoading, setMoraLoading] = useState(false);

  const withEmail = useMemo(() => playersWithEmail(players), [players]);

  const pricingItems = useMemo(() => {
    const items = boatPricing?.items?.length
      ? boatPricing.items
      : getDefaultBoatPricingItems();
    return splitPricingItems(items).embarcaciones;
  }, [boatPricing]);

  const boatGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const item of pricingItems) {
      if (item.group) groups.add(item.group);
    }
    return [...groups].sort((a, b) => a.localeCompare(b, "es"));
  }, [pricingItems]);

  const itemsById = useMemo(() => {
    const map = new Map<string, { group: string; label: string }>();
    for (const item of pricingItems) {
      map.set(item.id, { group: item.group, label: item.label });
    }
    return map;
  }, [pricingItems]);

  const fetchMora = useCallback(async () => {
    if (!activeSchoolId || !user) return;
    setMoraLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/payments/players-status?schoolId=${encodeURIComponent(activeSchoolId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        setDelinquentIds(new Set());
        return;
      }
      const data = await res.json();
      const ids = new Set<string>(
        (data.delinquents ?? []).map((d: { playerId?: string }) => d.playerId).filter(Boolean)
      );
      setDelinquentIds(ids);
    } catch {
      setDelinquentIds(new Set());
    } finally {
      setMoraLoading(false);
    }
  }, [activeSchoolId, user]);

  useEffect(() => {
    if (audience === "mora") fetchMora();
  }, [audience, fetchMora]);

  useEffect(() => {
    if (audience === "boat_group" && boatGroups.length > 0 && !boatGroup) {
      setBoatGroup(boatGroups[0]);
    }
  }, [audience, boatGroups, boatGroup]);

  const filtered = useMemo(() => {
    switch (audience) {
      case "all":
        return withEmail;
      case "mora":
        return withEmail.filter(
          (p) => delinquentIds.has(p.id) || p.status === "suspended"
        );
      case "with_boats":
        return withEmail.filter(playerHasBoat);
      case "boat_group":
        if (!boatGroup) return [];
        return withEmail.filter((p) =>
          playerMatchesBoatGroup(p, boatGroup, itemsById)
        );
      case "specific":
        return withEmail.filter((p) => selectedIds.has(p.id));
      default:
        return withEmail;
    }
  }, [audience, withEmail, delinquentIds, boatGroup, itemsById, selectedIds]);

  const searchableClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return withEmail;
    return withEmail.filter((p) => {
      const name = playerNameSearchText(p);
      const email = (p.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [withEmail, clientSearch]);

  const toggleClient = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of searchableClients) next.add(p.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleSend = async () => {
    const sub = subject.trim();
    const content = body.trim();
    if (!sub) {
      toast({
        variant: "destructive",
        title: "Asunto requerido",
        description: "Escribí el asunto del mensaje.",
      });
      return;
    }
    if (!content) {
      toast({
        variant: "destructive",
        title: "Mensaje requerido",
        description: "Escribí el contenido del mensaje.",
      });
      return;
    }
    if (filtered.length === 0) {
      toast({
        variant: "destructive",
        title: "Sin destinatarios",
        description:
          audience === "specific"
            ? "Seleccioná al menos un cliente con email."
            : "No hay clientes con email que coincidan con el filtro.",
      });
      return;
    }

    setSending(true);
    try {
      const contentHtml = content.replace(/\n/g, "<br>");
      const html = buildEmailHtml(contentHtml, {
        brandName,
        logoUrl,
        title: brandName,
        baseUrl: typeof window !== "undefined" ? window.location.origin : "",
        greeting: `Mensaje de ${brandName}:`,
      });
      const text = htmlToPlainText(contentHtml);

      for (const player of filtered) {
        const to = player.email!.trim().toLowerCase();
        await sendMailDoc(firestore, { to, subject: sub, html, text });
      }

      toast({
        title: "Mensajes encolados",
        description: `Se encolaron ${filtered.length} correos. La extensión Trigger Email los enviará en breve.`,
      });
      setSubject("");
      setBody("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al encolar los correos.";
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      });
    } finally {
      setSending(false);
    }
  };

  if (profile?.role !== "school_admin") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Enviar mensajes</CardTitle>
          <CardDescription>
            Solo el administrador de la náutica puede enviar mensajes masivos.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (playersLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Cargando clientes…</p>
        </CardContent>
      </Card>
    );
  }

  const previewNames = filtered.slice(0, 8).map((p) => formatPlayerName(p));

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Enviar mensaje masivo a clientes
        </CardTitle>
        <CardDescription>
          Filtrá a quién enviás. Solo reciben el correo los que tienen email cargado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="mass-audience">Destinatarios</Label>
          <Select
            value={audience}
            onValueChange={(v) => setAudience(v as AudienceMode)}
          >
            <SelectTrigger id="mass-audience" className="w-full max-w-md">
              <SelectValue placeholder="Elegí el grupo" />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {audience === "boat_group" && (
            <div className="space-y-2 max-w-md">
              <Label htmlFor="mass-boat-group">Tipo de embarcación</Label>
              <Select value={boatGroup} onValueChange={setBoatGroup}>
                <SelectTrigger id="mass-boat-group">
                  <SelectValue placeholder="Elegí el tipo" />
                </SelectTrigger>
                <SelectContent>
                  {boatGroups.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {audience === "specific" && (
            <div className="space-y-3 rounded-md border p-3 max-w-lg">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Buscar por nombre o email…"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="flex-1 min-w-[180px]"
                />
                <Button type="button" variant="outline" size="sm" onClick={selectAllVisible}>
                  Seleccionar visibles
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                  Limpiar
                </Button>
              </div>
              <ScrollArea className="h-48 rounded border">
                <div className="p-2 space-y-1">
                  {searchableClients.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">
                      No hay clientes con email que coincidan.
                    </p>
                  ) : (
                    searchableClients.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => toggleClient(p.id)}
                        />
                        <span className="truncate font-medium">{formatPlayerName(p)}</span>
                        <span className="truncate text-muted-foreground text-xs">
                          {p.email}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                {selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {audience === "mora" && moraLoading ? (
              <>Cargando morosos…</>
            ) : (
              <>
                <strong>{filtered.length}</strong> cliente
                {filtered.length !== 1 ? "s" : ""} con email recibirán el mensaje.
                {withEmail.length < players.length && (
                  <> ({players.length - withEmail.length} sin email, no se incluyen).</>
                )}
              </>
            )}
          </p>
          {filtered.length > 0 && filtered.length <= 20 && (
            <p className="text-xs text-muted-foreground">
              {previewNames.join(", ")}
              {filtered.length > previewNames.length
                ? ` y ${filtered.length - previewNames.length} más`
                : ""}
            </p>
          )}
          {filtered.length > 20 && (
            <p className="text-xs text-muted-foreground">
              Ej.: {previewNames.join(", ")}… (+{filtered.length - previewNames.length})
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="mass-subject">Asunto</Label>
          <Input
            id="mass-subject"
            placeholder="Ej: Aviso importante"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mass-body">Mensaje</Label>
          <Textarea
            id="mass-body"
            placeholder="Escribí el mensaje que recibirán por correo."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="resize-y"
          />
        </div>

        <Button onClick={handleSend} disabled={sending || filtered.length === 0 || moraLoading}>
          {sending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando…
            </>
          ) : (
            <>
              Enviar a {filtered.length} destinatario
              {filtered.length !== 1 ? "s" : ""}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
