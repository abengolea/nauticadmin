import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NauticAdminLogo } from "@/components/icons/NauticAdminLogo";

export default function EscuelasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-card px-4 lg:px-6 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <NauticAdminLogo className="h-8 w-8 shrink-0" />
          <span className="font-bold font-headline text-base sm:text-lg">NauticAdmin</span>
        </Link>
        <nav className="flex items-center gap-2 ml-auto">
          <Button variant="ghost" asChild size="sm">
            <Link href="/auth/login">Iniciar Sesión</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/auth/registro">Registrarme</Link>
          </Button>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-6 px-4 lg:px-6">
        <p className="text-xs text-muted-foreground text-center">
          &copy; {new Date().getFullYear()} NauticAdmin. Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
}
