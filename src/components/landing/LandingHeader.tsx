"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { NauticAdminLogo } from "@/components/icons/NauticAdminLogo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV = [
  { href: "#producto", label: "Producto" },
  { href: "#funcionalidades", label: "Funcionalidades" },
  { href: "#nauticas", label: "Para náuticas" },
  { href: "#clientes", label: "Clientes" },
];

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-200 ${
        scrolled
          ? "border-b border-border/80 bg-background/95 text-foreground shadow-sm backdrop-blur-sm"
          : "border-b border-transparent bg-transparent text-white"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.25rem] sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <NauticAdminLogo className={scrolled ? "h-8 w-8" : "h-8 w-8 brightness-0 invert"} />
          <span className="font-headline text-lg font-semibold tracking-[-0.02em] sm:text-xl">
            NauticAdmin
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Secciones">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`text-sm font-medium underline-offset-4 transition-opacity hover:opacity-80 ${
                scrolled ? "text-foreground/80 hover:text-foreground" : "text-white/85 hover:text-white"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant={scrolled ? "default" : "secondary"}
            className={`hidden h-10 px-4 text-sm font-semibold sm:inline-flex ${
              scrolled ? "" : "bg-white text-primary hover:bg-white/90"
            }`}
          >
            <Link href="/auth/login">Ingresar</Link>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`lg:hidden ${scrolled ? "" : "text-white hover:bg-white/10 hover:text-white"}`}
                aria-label="Abrir menú"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(100%,20rem)]">
              <SheetHeader>
                <SheetTitle className="font-headline text-left">NauticAdmin</SheetTitle>
              </SheetHeader>
              <nav className="mt-8 flex flex-col gap-1" aria-label="Menú móvil">
                {NAV.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <a
                      href={item.href}
                      className="rounded-md px-2 py-3 text-base font-medium text-foreground hover:bg-secondary"
                    >
                      {item.label}
                    </a>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link
                    href="/auth/login"
                    className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  >
                    Ingresar
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    href="/auth/registro"
                    className="inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium text-foreground"
                  >
                    Acceso clientes
                  </Link>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
