"use client";
import { Header } from "@/components/layout/Header";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { SidebarProvider, Sidebar, SidebarInset } from "@/components/ui/sidebar";
import { useUserProfile } from "@/firebase";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, isReady, user } = useUserProfile();
  const router = useRouter();

  useEffect(() => {
    // This effect handles redirects once the profile status is determined.
    if (!isReady) return; // Wait until the profile is fully loaded

    if (!user) {
      // If there's no user at all, go to login.
      router.push("/auth/login");
    } else if (!profile) {
      // If there's a user but no profile (meaning no roles found),
      // they need to wait for an admin to assign them.
      router.push("/auth/pending-approval");
    }
  }, [isReady, user, profile, router]);

  // Render a loading state until the profile is ready.
  // This prevents any child components from rendering with incomplete auth data.
  if (!isReady || !profile) {
    return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
  }

  // If a profile exists, the user is authorized to see the dashboard layout.
  return (
    <SidebarProvider>
        <Sidebar variant="inset" collapsible="icon">
          <SidebarNav />
        </Sidebar>
        <SidebarInset className="bg-background">
          <Header />
          <main className="flex-1 overflow-y-auto p-4 pt-6 md:p-8">
            {children}
          </main>
        </SidebarInset>
    </SidebarProvider>
  );
}
