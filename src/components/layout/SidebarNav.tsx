"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Home,
  Users,
  Settings,
  Building,
  Shield,
  Video,
  Mail,
  MessageCircle,
  Headphones,
  Banknote,
  Sliders,
  History,
  UserX,
  Building2,
  CalendarClock,
  Ship,
  FileSpreadsheet,
  Receipt,
  ClipboardCheck,
  BarChart3,
  Calculator,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { NauticAdminLogo } from "../icons/NauticAdminLogo";
import { useUserProfile, useDoc, useFirebase } from "@/firebase";
import { isPlayerProfileComplete } from "@/lib/utils";
import type { Player } from "@/lib/types";
import { getAuth } from "firebase/auth";
/** Menú operador: operación diaria + soporte */
const operadorMenuItems = [
  { href: "/dashboard", label: "Panel Principal", icon: Home },
  { href: "/dashboard/players", label: "Clientes", icon: Users },
  { href: "/dashboard/solicitudes", label: "Solicitudes embarcaciones", icon: Ship },
  { href: "/dashboard/support", label: "Centro de Soporte", icon: MessageCircle },
];

function isSidebarItemActive(
  href: string,
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>
): boolean {
  if (href.includes("tab=mensualidad")) {
    return pathname === "/dashboard/payments" && searchParams.get("tab") === "mensualidad";
  }
  if (href === "/dashboard/payments") {
    return pathname === "/dashboard/payments" && searchParams.get("tab") !== "mensualidad";
  }
  if (href === "/dashboard/expenses") {
    return pathname === "/dashboard/expenses";
  }
  if (href === "/dashboard/expenses/vendors") {
    return (
      pathname === "/dashboard/expenses/vendors" ||
      pathname.startsWith("/dashboard/expenses/vendor/")
    );
  }
  if (href === "/dashboard/accounting") {
    return pathname === "/dashboard/accounting";
  }
  if (href === "/dashboard") {
    return (
      pathname === "/dashboard" &&
      (!searchParams.get("tab") || searchParams.get("tab") === "schools")
    );
  }
  if (href.startsWith("/dashboard?tab=")) {
    return pathname === "/dashboard" && searchParams.get("tab") === href.split("tab=")[1];
  }
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(`${base}/`);
}

const superAdminMenuItems = [
    { href: "/dashboard", label: "Náuticas", icon: Building },
    { href: "/dashboard?tab=users", label: "Usuarios", icon: Users },
    { href: "/dashboard?tab=reports", label: "Reportes", icon: BarChart3 },
    { href: "/dashboard/support/operator", label: "Tickets de Soporte", icon: Headphones },
    { href: "/dashboard/admin/config", label: "Configuración global", icon: Sliders },
    { href: "/dashboard/admin/test-email", label: "Probar Trigger Email", icon: Mail },
    { href: "/dashboard/admin/audit", label: "Auditoría", icon: History },
    { href: "/dashboard/admin/delete-test-users", label: "Borrar usuarios de prueba", icon: UserX },
    { href: "/dashboard/admin/mensualidades", label: "Mensualidades", icon: Banknote },
];


export function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isMobile, setOpenMobile } = useSidebar();
  const { app } = useFirebase();
  const { isSuperAdmin, isReady, profile, activeSchoolId, isPlayer } = useUserProfile();
  const [hasPaymentOverdue, setHasPaymentOverdue] = useState(false);
  const playerPath = profile?.role === "player" && profile?.activeSchoolId && profile?.playerId
    ? `schools/${profile.activeSchoolId}/players/${profile.playerId}`
    : "";
  const { data: player } = useDoc<Player>(playerPath);
  const playerProfileComplete = !player || isPlayerProfileComplete(player);

  const fetchPaymentOverdue = useCallback(async () => {
    if (!isPlayer || !app) return;
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken().catch(() => null);
    if (!token) return;
    const res = await fetch("/api/payments/me", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    setHasPaymentOverdue(Boolean(data.hasOverdue));
  }, [isPlayer, app]);

  useEffect(() => {
    if (isReady && isPlayer) fetchPaymentOverdue();
  }, [isReady, isPlayer, fetchPaymentOverdue]);

  const closeMobileSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);
  let menuItems;

  if (isSuperAdmin) {
    menuItems = superAdminMenuItems;
  } else if (profile?.role === 'player' && profile.activeSchoolId && profile.playerId) {
    // Cliente: si perfil incompleto "Mi perfil" + "Pagos"; si completo, panel, perfil, pagos y soporte
    const profileHref = `/dashboard/players/${profile.playerId}?schoolId=${profile.activeSchoolId}`;
    if (!playerProfileComplete) {
      const tab = (t: string) => `${profileHref}&tab=${t}`;
      menuItems = [
        { href: profileHref, label: "Mi perfil", icon: Users },
        { href: "/dashboard/appointments", label: "Sacar turno", icon: CalendarClock },
        { href: tab("attendance"), label: "Asistencia", icon: ClipboardCheck },
        { href: tab("videoteca"), label: "Galería", icon: Video },
        { href: "/dashboard/payments", label: "Mis pagos", icon: Banknote, badgeOverdue: true },
      ];
    } else {
      const tab = (t: string) => `${profileHref}&tab=${t}`;
      menuItems = [
        { href: "/dashboard", label: "Panel Principal", icon: Home },
        { href: profileHref, label: "Mi perfil", icon: Users },
        { href: "/dashboard/appointments", label: "Sacar turno", icon: CalendarClock },
        { href: tab("videoteca"), label: "Galería", icon: Video },
        { href: "/dashboard/payments", label: "Mis pagos", icon: Banknote, badgeOverdue: true },
        { href: "/dashboard/support", label: "Centro de Soporte", icon: MessageCircle },
      ];
    }
  } else if (profile?.role === "school_admin" && profile.activeSchoolId) {
    // Admin: operación → cobranzas → contabilidad → soporte → configuración
    menuItems = [
      { href: "/dashboard", label: "Panel Principal", icon: Home },
      { href: "/dashboard/players", label: "Clientes", icon: Users },
      { href: "/dashboard/solicitudes", label: "Solicitudes embarcaciones", icon: Ship },
      { href: "/dashboard/payments", label: "Ventas y pagos", icon: Banknote },
      { href: "/dashboard/reconciliation", label: "Conciliación", icon: FileSpreadsheet },
      { href: "/dashboard/expenses", label: "Gastos", icon: Receipt },
      { href: "/dashboard/expenses/vendors", label: "Proveedores", icon: Truck },
      { href: "/dashboard/accounting", label: "Contabilidad", icon: Calculator },
      { href: "/dashboard/support", label: "Centro de Soporte", icon: MessageCircle },
      { href: "/dashboard/messages", label: "Mensajes", icon: Mail },
      {
        href: `/dashboard/schools/${profile.activeSchoolId}`,
        label: "Gestionar Náutica",
        icon: Shield,
      },
      { href: "/dashboard/payments?tab=mensualidad", label: "Mensualidades", icon: Building2 },
    ];
  } else {
    menuItems = [...operadorMenuItems];
  }

  const uniqueMenuItems = menuItems;

  return (
    <>
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2 p-2" onClick={closeMobileSidebar}>
          <NauticAdminLogo className="h-8 w-8" />
          <span className="text-xl font-bold font-headline">NauticAdmin</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="p-2">
        {!isReady ? (
            <div className="flex flex-col gap-2 pt-2">
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
            </div>
        ) : (
            <SidebarMenu>
            {uniqueMenuItems.map((item) => (
                <SidebarMenuItem key={`${item.href}-${item.label}`}>
                <Link href={item.href} className="relative flex items-center" onClick={closeMobileSidebar}>
                    <SidebarMenuButton
                    isActive={isSidebarItemActive(item.href, pathname, searchParams)}
                    tooltip={item.label}
                    className="font-headline w-full"
                    >
                    <item.icon />
                    <span>{item.label}</span>
                    {"badgeOverdue" in item && item.badgeOverdue && hasPaymentOverdue && (
                      <Badge variant="destructive" className="ml-auto h-5 min-w-5 rounded-full px-1.5 text-xs" title="Cuota vencida">
                        !
                      </Badge>
                    )}
                    </SidebarMenuButton>
                </Link>
                </SidebarMenuItem>
            ))}
            </SidebarMenu>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href="/dashboard/settings" onClick={closeMobileSidebar}>
              <SidebarMenuButton
                isActive={pathname.startsWith("/dashboard/settings")}
                tooltip="Ajustes"
                className="font-headline"
              >
                <Settings />
                <span>Ajustes</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
