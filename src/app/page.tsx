import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Anchor,
  FileText,
  Ship,
  Users,
  Wallet,
  Wrench,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NauticAdminLogo } from "@/components/icons/NauticAdminLogo";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { ClientPortalPreview, ProductPreview } from "@/components/landing/ProductPreview";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://nauticadmin--nauticadmin.us-east4.hosted.app";

export const metadata: Metadata = {
  title: "NauticAdmin | Software de gestión para clubes náuticos y marinas",
  description:
    "Administrá embarcaciones, amarras, clientes, servicios, documentación y cobros desde una única plataforma para clubes náuticos, marinas y guarderías.",
  openGraph: {
    title: "NauticAdmin | Software de gestión para clubes náuticos y marinas",
    description:
      "Administrá embarcaciones, amarras, clientes, servicios, documentación y cobros desde una única plataforma.",
    locale: "es_AR",
    type: "website",
    url: SITE_URL,
    images: [{ url: `${SITE_URL}/landing/hero.jpg`, width: 1920, height: 1280, alt: "Marina con amarras" }],
  },
};

const FEATURES = [
  { title: "Embarcaciones", text: "Registro completo de las embarcaciones vinculadas a cada cliente.", icon: Ship },
  { title: "Amarras", text: "Asignación y administración de amarras y espacios disponibles.", icon: Anchor },
  { title: "Clientes", text: "Información centralizada de socios, propietarios y responsables.", icon: Users },
  { title: "Cobros", text: "Seguimiento de conceptos, pagos, saldos y obligaciones.", icon: Wallet },
  { title: "Servicios", text: "Registro y gestión de servicios prestados a cada embarcación.", icon: Wrench },
  { title: "Documentación", text: "Centralización de documentación e información relevante.", icon: FileText },
];

const PRODUCT_POINTS = [
  { title: "Información centralizada", text: "Clientes, embarcaciones y cobros en un mismo panel." },
  { title: "Búsqueda rápida", text: "Encontrá una ficha o un movimiento sin recorrer planillas." },
  { title: "Acceso desde cualquier dispositivo", text: "El panel funciona en escritorio, notebook y celular." },
  { title: "Menos tareas manuales", text: "Menos carga repetida, menos mensajes sueltos." },
  { title: "Mayor control operativo", text: "Una vista clara de lo que está al día y lo que falta." },
];

const AUDIENCE = [
  "Clubes náuticos",
  "Marinas",
  "Guarderías náuticas",
  "Puertos deportivos",
  "Administradores de amarras",
];

const BENEFITS = [
  { title: "Información centralizada", text: "Todo disponible en un único sistema." },
  { title: "Menos errores", text: "Reducí duplicaciones y registros inconsistentes." },
  { title: "Más velocidad", text: "Encontrá rápidamente la información que necesitás." },
  { title: "Mejor gestión", text: "Obtené una visión clara de la operación de la náutica." },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <LandingHeader />

      <main className="flex-1">
        <section className="relative isolate min-h-[34rem] overflow-hidden sm:min-h-[38rem]">
          <Image
            src="/landing/hero.jpg"
            alt="Vista aérea de una marina con embarcaciones amarradas"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/25" />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col justify-center px-4 pb-16 pt-28 sm:px-6 sm:pb-20 sm:pt-32 lg:min-h-[38rem]">
            <div className="landing-fade max-w-2xl text-white">
              <h1 className="font-headline text-[2.15rem] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-5xl sm:leading-[1.1]">
                Toda tu náutica, en un solo lugar.
              </h1>
              <p className="mt-5 max-w-[40ch] text-lg leading-relaxed text-white/88 sm:text-xl">
                Administrá embarcaciones, amarras, clientes, servicios, documentación y cobros desde una única
                plataforma.
              </p>
              <p className="mt-3 text-sm font-medium text-white/70 sm:text-base">
                Menos planillas. Menos mensajes dispersos. Más control.
              </p>
              <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
                <Button asChild size="lg" className="h-12 bg-white px-6 text-base font-semibold text-primary hover:bg-white/90">
                  <a href="#funcionalidades">Conocer NauticAdmin</a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 border-white/40 bg-transparent px-6 text-base font-semibold text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/auth/login">Ingresar</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section id="funcionalidades" className="scroll-mt-24 border-b border-border bg-background">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="font-headline text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              Todo bajo control
            </h2>
            <p className="mt-4 max-w-[58ch] text-base leading-7 text-foreground/70 sm:text-lg">
              NauticAdmin centraliza la información que necesitás para administrar tu institución sin depender de
              múltiples planillas, sistemas y conversaciones.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((item) => (
                <article
                  key={item.title}
                  className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/25"
                >
                  <item.icon className="h-5 w-5 text-primary" aria-hidden />
                  <h3 className="mt-4 font-headline text-xl font-semibold tracking-[-0.02em]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-foreground/70">{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="producto" className="scroll-mt-24 bg-secondary/50">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="max-w-[20ch] font-headline text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              La información de tu náutica, en una sola pantalla.
            </h2>
            <div className="mt-10 grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <ProductPreview />
              <p className="mt-3 text-xs text-muted-foreground">Vista ilustrativa del panel de administración.</p>
            </div>
            <ul className="space-y-5">
              {PRODUCT_POINTS.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-foreground/70">{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-background">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="max-w-[22ch] font-headline text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              Administrar una náutica no debería depender de planillas y mensajes de WhatsApp.
            </h2>
            <p className="mt-4 max-w-[58ch] text-base leading-7 text-foreground/70 sm:text-lg">
              Cuando la información queda distribuida entre archivos, chats, cuadernos y diferentes personas,
              administrar se vuelve más difícil. NauticAdmin concentra todo en un mismo lugar.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
              <div className="rounded-xl border border-border bg-muted/40 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Antes</p>
                <ul className="mt-4 space-y-2 text-sm text-foreground/75">
                  {["Planillas", "WhatsApp", "Papeles", "Archivos separados", "Información duplicada"].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="hidden items-center text-2xl text-primary md:flex" aria-hidden>
                →
              </div>
              <div className="rounded-xl border border-primary/20 bg-secondary p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">NauticAdmin</p>
                <ul className="mt-4 space-y-2 text-sm font-medium text-foreground">
                  {["Información centralizada", "Acceso inmediato", "Historial", "Control", "Organización"].map(
                    (item) => (
                      <li key={item}>{item}</li>
                    )
                  )}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="nauticas" className="scroll-mt-24 bg-background">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
              <Image
                src="/landing/boats.jpg"
                alt="Guardería náutica y amarras vistas desde el aire"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            <div>
              <h2 className="font-headline text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                Hecho para quienes administran náuticas
              </h2>
              <p className="mt-4 text-base leading-7 text-foreground/70 sm:text-lg">
                NauticAdmin fue pensado específicamente para clubes náuticos, marinas, guarderías y organizaciones que
                necesitan administrar embarcaciones, espacios, clientes y servicios de manera ordenada.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {AUDIENCE.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-border bg-secondary/70 px-3 py-1.5 text-sm text-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="clientes" className="scroll-mt-24 bg-secondary/50">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
            <div>
              <h2 className="font-headline text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                También para tus clientes
              </h2>
              <p className="mt-4 max-w-[48ch] text-base leading-7 text-foreground/70 sm:text-lg">
                Tus clientes pueden acceder a su información, consultar datos relacionados con sus embarcaciones y
                mantener una relación más simple con la administración.
              </p>
              <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
                <Button asChild size="lg" className="h-12 px-6 text-base font-semibold">
                  <Link href="/auth/login">Acceso clientes</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base font-medium">
                  <Link href="/auth/registro">Crear cuenta</Link>
                </Button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                También podés{" "}
                <Link href="/solicitud" className="underline underline-offset-4">
                  solicitar una embarcación
                </Link>{" "}
                sin registrarte.
              </p>
            </div>
            <div className="space-y-4">
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl">
                <Image
                  src="/landing/nordelta.jpg"
                  alt="Marina en el Delta bonaerense"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
              <ClientPortalPreview />
            </div>
          </div>
        </section>

        <section className="bg-background">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="font-headline text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              Menos administración. Más control.
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              {BENEFITS.map((item) => (
                <div key={item.title} className="border-t border-primary/25 pt-4">
                  <h3 className="font-headline text-xl font-semibold tracking-[-0.02em]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-foreground/70">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative isolate min-h-[16rem] overflow-hidden sm:min-h-[20rem]">
          <Image
            src="/landing/docks.jpg"
            alt="Puerto y marina vistos desde el aire"
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/45" />
          <div className="relative mx-auto flex min-h-[16rem] w-full max-w-6xl items-center px-4 py-16 sm:min-h-[20rem] sm:px-6">
            <p className="max-w-[20ch] font-headline text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
              Tu náutica organizada. Tu información siempre disponible.
            </p>
          </div>
        </section>

        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16 sm:px-6 sm:py-20 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <h2 className="font-headline text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                Empezá a administrar tu náutica de otra manera.
              </h2>
              <p className="mt-4 text-base leading-7 text-primary-foreground/80 sm:text-lg">
                Centralizá embarcaciones, clientes, amarras, servicios y cobros con NauticAdmin.
              </p>
            </div>
            <div className="flex flex-col gap-3 min-[420px]:flex-row">
              <Button asChild size="lg" className="h-12 bg-white px-6 text-base font-semibold text-primary hover:bg-white/90">
                <a href="#funcionalidades">Conocer NauticAdmin</a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-white/35 bg-transparent px-6 text-base font-semibold text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/auth/login">Ingresar</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <NauticAdminLogo className="h-8 w-8" />
              <p className="font-headline text-lg font-semibold">NauticAdmin</p>
            </div>
            <p className="mt-3 max-w-[36ch] text-sm leading-6 text-muted-foreground">
              Software de gestión para clubes náuticos, marinas y guarderías.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-2 text-sm" aria-label="Pie de página">
            <a href="#producto" className="py-1 text-foreground/75 hover:text-foreground">
              Producto
            </a>
            <Link href="/auth/login" className="py-1 text-foreground/75 hover:text-foreground">
              Acceso administradores
            </Link>
            <Link href="/auth/login" className="py-1 text-foreground/75 hover:text-foreground">
              Acceso clientes
            </Link>
            <Link href="/auth/registro" className="py-1 text-foreground/75 hover:text-foreground">
              Registro de clientes
            </Link>
          </nav>
        </div>
        <div className="border-t border-border">
          <p className="mx-auto w-full max-w-6xl px-4 py-4 text-sm text-muted-foreground sm:px-6">
            © {new Date().getFullYear()} NauticAdmin
          </p>
        </div>
      </footer>
    </div>
  );
}
