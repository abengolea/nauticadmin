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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { Player } from "@/lib/types";
import { getPlayerEmbarcaciones } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCollection, useUserProfile } from "@/firebase";
import { Skeleton } from "../ui/skeleton";
import React, { useMemo, useState, useEffect, useCallback } from "react";
import { FileDown, CreditCard, CheckCircle, Loader2, Search, Mail, FileX, FileCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

type DelinquentInfo = {
  playerId: string;
  period: string;
  amount: number;
  currency: string;
  isRegistration?: boolean;
};

type ClothingPendingItem = { period: string; amount: number; installmentIndex: number; totalInstallments: number };

export function PlayerTable({ schoolId: propSchoolId }: { schoolId?: string }) {
  const router = useRouter();
  const { isReady, activeSchoolId: userActiveSchoolId, profile, user, isAdmin, isCoach } = useUserProfile();
  const canInviteAccess = isAdmin || isCoach;

  const schoolId = propSchoolId || userActiveSchoolId;
  const canListPlayers = profile?.role !== "player";
  const canSeePaymentStatus = isAdmin && !!schoolId;
  const canToggleStatus = (isAdmin || isCoach) && !!schoolId;

  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [updatingFactura, setUpdatingFactura] = useState(false);
  const [statusUpdatingByPlayerId, setStatusUpdatingByPlayerId] = useState<Set<string>>(new Set());
  const [paymentStatus, setPaymentStatus] = useState<{
    delinquents: (DelinquentInfo & { dueDate: string })[];
    clothingPendingByPlayer: Record<string, ClothingPendingItem[]>;
  } | null>(null);
  const [paymentStatusLoading, setPaymentStatusLoading] = useState(false);

  const fetchPaymentStatus = useCallback(async () => {
    if (!canSeePaymentStatus || !schoolId) return;
    const token = await user?.getIdToken?.();
    if (!token) return;
    setPaymentStatusLoading(true);
    try {
      const res = await fetch(`/api/payments/players-status?schoolId=${encodeURIComponent(schoolId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPaymentStatus({
          delinquents: data.delinquents ?? [],
          clothingPendingByPlayer: data.clothingPendingByPlayer ?? {},
        });
      } else {
        setPaymentStatus(null);
      }
    } catch {
      setPaymentStatus(null);
    } finally {
      setPaymentStatusLoading(false);
    }
  }, [canSeePaymentStatus, schoolId, user?.uid]);

  useEffect(() => {
    fetchPaymentStatus();
  }, [fetchPaymentStatus]);

  const handleToggleStatus = useCallback(
    async (playerId: string, currentStatus: string) => {
      if (!user || !schoolId || !canToggleStatus) return;
      setStatusUpdatingByPlayerId((prev) => new Set(prev).add(playerId));
      try {
        const token = await user.getIdToken();
        const newStatus = currentStatus === "active" ? "inactive" : "active";
        const res = await fetch("/api/players/status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ schoolId, playerId, status: newStatus }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Error al cambiar estado");
        toast({
          title: newStatus === "active" ? "Cliente activado" : "Cliente desactivado",
          description: newStatus === "active"
            ? "El cliente ya puede ingresar al panel."
            : "El cliente ya no puede ingresar al panel.",
        });
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "No se pudo cambiar el estado.",
        });
      } finally {
        setStatusUpdatingByPlayerId((prev) => {
          const next = new Set(prev);
          next.delete(playerId);
          return next;
        });
      }
    },
    [user, schoolId, canToggleStatus, toast]
  );

  const posicionLabel: Record<string, string> = {
    arquero: "Arquero",
    delantero: "Delantero",
    mediocampo: "Mediocampo",
    defensor: "Defensor",
  };

  const { data: players, loading, error } = useCollection<Player>(
    isReady && schoolId && canListPlayers ? `schools/${schoolId}/players` : '',
    { orderBy: ['lastName', 'asc'] }
  );

  const activePlayers = useMemo(() => (players ?? []).filter((p) => !p.archived), [players]);

  const sortedAndFilteredPlayers = useMemo(() => {
    if (!activePlayers.length) return [];
    return [...activePlayers].sort((a, b) => {
      const lnA = (a.lastName ?? "").toLowerCase();
      const lnB = (b.lastName ?? "").toLowerCase();
      const cmp = lnA.localeCompare(lnB);
      if (cmp !== 0) return cmp;
      const fnA = (a.firstName ?? "").toLowerCase();
      const fnB = (b.firstName ?? "").toLowerCase();
      return fnA.localeCompare(fnB);
    });
  }, [activePlayers]);

  const filteredBySearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedAndFilteredPlayers;
    return sortedAndFilteredPlayers.filter((p) => {
      const embarcaciones = getPlayerEmbarcaciones(p);
      const embarcacionText = embarcaciones.map((e) => [e.nombre, e.matricula].filter(Boolean).join(" ")).join(" ").toLowerCase();
      const fullName = `${p.firstName ?? ""} ${p.lastName ?? ""}`.toLowerCase();
      const ubicacion = (p.ubicacion ?? "").toLowerCase();
      const dni = (p.dni ?? "").toLowerCase();
      const email = (p.email ?? "").toLowerCase();
      const tutorName = (p.tutorContact?.name ?? "").toLowerCase();
      const observations = (p.observations ?? "").toLowerCase();
      return (
        fullName.includes(q) ||
        embarcacionText.includes(q) ||
        ubicacion.includes(q) ||
        dni.includes(q) ||
        email.includes(q) ||
        tutorName.includes(q) ||
        observations.includes(q)
      );
    });
  }, [sortedAndFilteredPlayers, searchQuery]);

  const playersWithEmail = useMemo(
    () =>
      filteredBySearch.filter(
        (p) =>
          (p.email ?? "").trim().includes("@") &&
          !(p as { accessInviteSentAt?: unknown }).accessInviteSentAt
      ),
    [filteredBySearch]
  );

  const toggleSelect = (playerId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const allWithEmailSelected =
    playersWithEmail.length > 0 && playersWithEmail.every((p) => selectedIds.has(p.id));
  const allFilteredSelected =
    filteredBySearch.length > 0 && filteredBySearch.every((p) => selectedIds.has(p.id));

  const toggleSelectAllWithEmail = () => {
    if (allWithEmailSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(playersWithEmail.map((p) => p.id)));
    }
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBySearch.map((p) => p.id)));
    }
  };

  const handleUpdateRequiereFactura = async (requiereFactura: boolean) => {
    if (!schoolId || selectedIds.size === 0 || !user) return;
    setUpdatingFactura(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/players/update-requiere-factura", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          playerIds: Array.from(selectedIds),
          requiereFactura,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? data.detail ?? "Error al actualizar");
      }
      setSelectedIds(new Set());
      toast({
        title: data.message ?? "Listo",
      });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo actualizar.",
      });
    } finally {
      setUpdatingFactura(false);
    }
  };

  const handleInviteAccess = async () => {
    if (!schoolId || selectedIds.size === 0 || !user) return;
    setInviting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/players/invite-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ schoolId, playerIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? data.detail ?? "Error al enviar invitaciones");
      }
      const { summary } = data;
      setSelectedIds(new Set());
      toast({
        title: data.message ?? "Listo",
        description:
          summary?.sent > 0
            ? `Se enviaron ${summary.sent} invitación${summary.sent !== 1 ? "es" : ""}. Los clientes recibirán un correo para crear su contraseña.`
            : summary?.skipped > 0
              ? "Los jugadores seleccionados no tienen email cargado."
              : undefined,
        duration: 6000,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudieron enviar las invitaciones.",
      });
    } finally {
      setInviting(false);
    }
  };

  const handleExportCsv = () => {
    const cols = [
      "Nombre",
      "Apellido",
      "Nombre de Embarcación",
      "Matrícula",
      "Ubicación",
      "Género",
      "DNI",
      "Obra social",
      "Email",
      "Teléfono tutor",
      "Nombre tutor",
      "Posición",
      "Estado",
      "Observaciones",
    ];
    const escape = (v: string | number | undefined) => {
      if (v == null || v === "") return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filteredBySearch.map((player) => {
      const emb = getPlayerEmbarcaciones(player);
      const nombresEmb = emb.map((e) => e.nombre).filter(Boolean).join("; ");
      const matriculasEmb = emb.map((e) => e.matricula).filter(Boolean).join("; ");
      return [
      escape(player.firstName),
      escape(player.lastName),
      escape(nombresEmb || (player as { embarcacionNombre?: string }).embarcacionNombre),
      escape(matriculasEmb || (player as { embarcacionMatricula?: string }).embarcacionMatricula),
      escape(player.ubicacion),
      escape(player.genero === "masculino" ? "Masculino" : player.genero === "femenino" ? "Femenino" : ""),
      escape(player.dni),
      escape(player.healthInsurance),
      escape(player.email),
      escape(player.tutorContact?.phone),
      escape(player.tutorContact?.name),
      escape(player.posicion_preferida ? posicionLabel[player.posicion_preferida] ?? player.posicion_preferida : ""),
      escape(player.status === "active" ? "Activo" : player.status === "suspended" ? "Mora" : "Inactivo"),
      escape(player.observations),
    ];
    });
    const csv = [cols.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jugadores-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasInviteColumn = canInviteAccess;
  const colCount = 6 + (hasInviteColumn ? 1 : 0) + (canSeePaymentStatus ? 1 : 0);

  // Mostrar loading cuando: perfil no listo, datos cargando, o staff sin náutica seleccionada
  const isWaitingForSchool = canListPlayers && !schoolId;
  const showLoading = !isReady || loading || isWaitingForSchool;

  if (showLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {isWaitingForSchool ? "Cargando náutica…" : "Cargando clientes…"}
        </p>
      </div>
    )
  }

  if (error) {
    return <div className="text-destructive p-4">Error al cargar los jugadores. Es posible que no tengas permisos para verlos.</div>
  }
  
  if (!players || activePlayers.length === 0) {
      return <div className="text-center text-muted-foreground p-4">No hay jugadores para mostrar en esta náutica.</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, embarcación, matrícula, ubicación..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {canListPlayers && (
          <>
            {hasInviteColumn && (
              <Button
                variant="default"
                size="sm"
                onClick={handleInviteAccess}
                disabled={selectedIds.size === 0 || inviting}
                className="shrink-0"
              >
                {inviting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Enviar invitaciones ({selectedIds.size})
              </Button>
            )}
            {canSeePaymentStatus && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUpdateRequiereFactura(false)}
                  disabled={selectedIds.size === 0 || updatingFactura}
                  className="shrink-0"
                >
                  {updatingFactura ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileX className="h-4 w-4 mr-2" />
                  )}
                  No facturar ({selectedIds.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUpdateRequiereFactura(true)}
                  disabled={selectedIds.size === 0 || updatingFactura}
                  className="shrink-0"
                >
                  <FileCheck className="h-4 w-4 mr-2" />
                  Facturar ({selectedIds.size})
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={filteredBySearch.length === 0}
              className="ml-auto shrink-0"
            >
              <FileDown className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </>
        )}
      </div>
      <div className="rounded-md border overflow-x-auto min-w-0">
        <Table className="min-w-[520px] sm:min-w-[600px]">
          <TableHeader>
            <TableRow>
              {hasInviteColumn && (
                <TableHead className="w-10 px-2">
                  <Checkbox
                    checked={
                      canSeePaymentStatus
                        ? allFilteredSelected
                          ? true
                          : selectedIds.size > 0
                            ? "indeterminate"
                            : false
                        : allWithEmailSelected
                          ? true
                          : selectedIds.size > 0
                            ? "indeterminate"
                            : false
                    }
                    onCheckedChange={canSeePaymentStatus ? toggleSelectAllFiltered : toggleSelectAllWithEmail}
                    disabled={canSeePaymentStatus ? filteredBySearch.length === 0 : playersWithEmail.length === 0}
                    aria-label={canSeePaymentStatus ? "Seleccionar todos" : "Seleccionar todos con email"}
                  />
                </TableHead>
              )}
              <TableHead className="text-xs sm:text-sm">Nombre</TableHead>
              <TableHead className="text-xs sm:text-sm whitespace-nowrap">Nombre de Embarcación</TableHead>
              <TableHead className="text-xs sm:text-sm whitespace-nowrap pr-1">Matrícula</TableHead>
              <TableHead className="text-xs sm:text-sm whitespace-nowrap pl-1">Ubicación</TableHead>
              <TableHead className="text-xs sm:text-sm whitespace-nowrap">Estado</TableHead>
              {canSeePaymentStatus && <TableHead className="text-xs sm:text-sm whitespace-nowrap">Pagos</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBySearch.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-muted-foreground py-6">
                  No hay clientes para mostrar.
                </TableCell>
              </TableRow>
            ) : (
              filteredBySearch.map((player) => {
                const playerDelinquents = paymentStatus?.delinquents?.filter((d) => d.playerId === player.id) ?? [];
                const clothingPending = paymentStatus?.clothingPendingByPlayer?.[player.id] ?? [];
                const hasPending = playerDelinquents.length > 0 || clothingPending.length > 0;
                const pendingLabels: string[] = [];
                if (playerDelinquents.some((d) => d.period === "inscripcion")) pendingLabels.push("inscripción");
                if (playerDelinquents.some((d) => d.period !== "inscripcion" && !d.period?.startsWith?.("ropa-"))) pendingLabels.push("cuota");
                if (clothingPending.length > 0) pendingLabels.push("ropa");
                return (
                <TableRow
                  key={player.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/dashboard/players/${player.id}?schoolId=${schoolId}`)}
                >
              {hasInviteColumn && (
                <TableCell className="w-10 px-2 py-2 sm:py-3" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(player.id)}
                    onCheckedChange={() => toggleSelect(player.id)}
                    disabled={!canSeePaymentStatus && !(player.email ?? "").trim().includes("@")}
                    aria-label={player.email ? `Seleccionar ${player.firstName} ${player.lastName}` : "Sin email"}
                  />
                </TableCell>
              )}
              <TableCell className="font-medium py-2 sm:py-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
                    <AvatarImage src={player.photoUrl} alt={player.firstName} data-ai-hint="person portrait" />
                    <AvatarFallback className="text-xs">{(player.firstName?.[0] || '')}{(player.lastName?.[0] || '')}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm sm:text-base">{player.firstName} {player.lastName}</span>
                  {canSeePaymentStatus && player.requiereFactura === false && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">No factura</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs sm:text-sm py-2 sm:py-3 truncate max-w-[140px]" title={getPlayerEmbarcaciones(player).map((e) => e.nombre).filter(Boolean).join(", ") || undefined}>
                {getPlayerEmbarcaciones(player).map((e) => e.nombre).filter(Boolean).join(", ") || (player as { embarcacionNombre?: string }).embarcacionNombre || '-'}
              </TableCell>
              <TableCell className="text-xs sm:text-sm py-2 sm:py-3 whitespace-nowrap pr-1">
                {getPlayerEmbarcaciones(player).map((e) => e.matricula).filter(Boolean).join(", ") || (player as { embarcacionMatricula?: string }).embarcacionMatricula || '-'}
              </TableCell>
              <TableCell className="text-xs sm:text-sm py-2 sm:py-3 min-w-[180px] whitespace-normal pl-1">
                {player.ubicacion || '-'}
              </TableCell>
              <TableCell className="py-2 sm:py-3" onClick={(e) => e.stopPropagation()}>
                {canToggleStatus && (player.status === "active" || player.status === "inactive") ? (
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(player.id, player.status ?? "active")}
                    disabled={statusUpdatingByPlayerId.has(player.id)}
                    className="inline-flex items-center"
                  >
                    <Badge
                      variant="secondary"
                      className={`capitalize text-[10px] sm:text-xs whitespace-nowrap cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${
                        player.status === "active"
                          ? "border-green-600/50 bg-green-500/10 text-green-700 dark:text-green-400"
                          : "border-red-600/50 bg-red-500/10 text-red-700 dark:text-red-400"
                      }`}
                    >
                      {statusUpdatingByPlayerId.has(player.id) ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-0.5 inline" />
                      ) : null}
                      {player.status === "active" ? "Activo" : "Inactivo"}
                    </Badge>
                  </button>
                ) : (
                  <Badge
                    variant={
                      player.status === "suspended"
                        ? "destructive"
                        : "secondary"
                    }
                    className={`capitalize text-[10px] sm:text-xs whitespace-nowrap ${
                      player.status === "active"
                        ? "border-green-600/50 bg-green-500/10 text-green-700 dark:text-green-400"
                        : player.status === "suspended"
                        ? "border-amber-600/50 bg-amber-500/10 text-amber-800 dark:text-amber-400"
                        : "border-red-600/50 bg-red-500/10 text-red-700 dark:text-red-400"
                    }`}
                  >
                    {player.status === "active"
                      ? "Activo"
                      : player.status === "suspended"
                      ? "Mora"
                      : "Inactivo"}
                  </Badge>
                )}
              </TableCell>
              {canSeePaymentStatus && (
                <TableCell className="py-2 sm:py-3" onClick={(e) => e.stopPropagation()}>
                  {paymentStatusLoading ? (
                    <Skeleton className="h-6 w-16" />
                  ) : hasPending ? (
                    <Button variant="outline" size="sm" className="h-7 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-600 dark:hover:bg-amber-950/50" asChild>
                      <Link href={`/dashboard/players/${player.id}?schoolId=${schoolId}`}>
                        <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                        Debe {pendingLabels.join(", ")}
                      </Link>
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Al día
                    </span>
                  )}
                </TableCell>
              )}
            </TableRow>
              );
            })
            )}
        </TableBody>
      </Table>
    </div>
    </div>
  );
}
