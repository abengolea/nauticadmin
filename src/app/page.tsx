import { Button } from "@/components/ui/button";
import Link from "next/link";
import { NauticAdminLogo } from "@/components/icons/NauticAdminLogo";

const OPERATIONS = [
  { name: "Clientes", detail: "Altas, fichas y cuenta corriente" },
  { name: "Embarcaciones", detail: "Solicitudes, amarras y servicios" },
  { name: "Cobros", detail: "Cuotas, comprobantes y mora" },
  { name: "Gastos", detail: "Proveedores y facturas" },
];

function MarinaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 640 420"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 268h640" className="stroke-primary/45" strokeWidth="1.4" />
      <path
        d="M0 292c80-18 160 10 240 4 80-6 140-28 220-16 80 12 120 8 180-8"
        className="stroke-primary/35"
        strokeWidth="1.4"
      />
      <path
        d="M0 318c90 14 170-16 250-8 90 8 150 24 230 8 70-14 110-8 160 6"
        className="stroke-primary/25"
        strokeWidth="1.4"
      />
      <g className="stroke-primary" strokeWidth="2" strokeLinecap="round">
        <path d="M118 268V118" />
        <path d="M118 122l46 16-46 16" className="fill-primary stroke-none" />
        <path d="M188 268V96" />
        <path d="M188 100l58 20-58 18" className="fill-accent stroke-none" />
        <path d="M268 268V148" />
        <path d="M268 152l38 14-38 14" className="fill-primary stroke-none" />
      </g>
      <path
        d="M72 268h230l12 36H60l12-36z"
        className="fill-primary/15 stroke-primary/50"
        strokeWidth="1.4"
      />
      <path d="M392 268h168l8 28H384l8-28z" className="fill-primary/10 stroke-primary/35" strokeWidth="1.2" />
      <circle cx="508" cy="214" r="3.5" className="fill-primary/70" />
      <path d="M508 268V214" className="stroke-primary/60" strokeWidth="1.6" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.25rem] sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <NauticAdminLogo className="h-8 w-8" />
            <span className="font-headline text-lg font-semibold tracking-[-0.02em] text-foreground sm:text-xl">
              NauticAdmin
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <Button variant="ghost" asChild className="h-11 px-2.5 text-[0.95rem] font-medium sm:px-4">
              <Link href="/auth/login">
                <span className="sm:hidden">Entrar</span>
                <span className="hidden sm:inline">Iniciar sesión</span>
              </Link>
            </Button>
            <Button asChild className="h-11 px-3 text-[0.95rem] font-medium sm:px-4">
              <Link href="/auth/registro">
                <span className="sm:hidden">Registro</span>
                <span className="hidden sm:inline">Soy cliente</span>
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="landing-water relative overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[54%] lg:block">
            <div className="landing-sheen absolute inset-0 opacity-70" />
            <MarinaMark className="absolute bottom-0 right-0 h-[min(420px,52vh)] w-auto max-w-full pr-6" />
          </div>

          <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24 lg:min-h-[calc(100dvh-4.25rem)] lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)] lg:items-center lg:pb-28 lg:pt-20">
            <div className="max-w-xl">
              <h1 className="font-headline text-[2.35rem] font-semibold leading-[1.18] tracking-[-0.025em] text-foreground sm:text-5xl sm:leading-[1.14] lg:text-[3.4rem] lg:leading-[1.12]">
                Administrá tu náutica
              </h1>
              <p className="mt-5 max-w-[38ch] text-lg leading-relaxed text-foreground/75 sm:text-xl sm:leading-relaxed">
                Clientes, embarcaciones, amarras, servicios y cobros en un solo escritorio.
              </p>
              <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center">
                <Button asChild size="lg" className="h-12 px-6 text-base font-semibold">
                  <Link href="/auth/login">Acceder al panel</Link>
                </Button>
                <Link
                  href="/auth/registro"
                  className="inline-flex h-12 items-center px-1 text-base font-medium text-foreground/80 underline decoration-primary/30 underline-offset-[5px] transition-colors hover:text-foreground hover:decoration-primary"
                >
                  Crear cuenta de cliente
                </Link>
              </div>
            </div>

            <div className="lg:hidden">
              <MarinaMark className="mx-auto h-auto w-full max-w-md text-primary" />
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-background">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-16 md:grid-cols-2 lg:grid-cols-4 lg:gap-8 lg:py-20">
            {OPERATIONS.map((item) => (
              <div key={item.name} className="border-t border-primary/25 pt-4">
                <h2 className="font-headline text-2xl font-semibold tracking-[-0.02em] text-foreground">
                  {item.name}
                </h2>
                <p className="mt-2 max-w-[28ch] text-[0.975rem] leading-6 text-foreground/70">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-secondary/60">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 sm:py-16 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <h2 className="font-headline text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl">
                ¿Sos cliente de la náutica?
              </h2>
              <p className="mt-4 max-w-[48ch] text-base leading-7 text-foreground/70 sm:text-lg">
                Creá tu cuenta. Un administrador te aprueba y vas a poder gestionar tus embarcaciones desde el panel.
              </p>
            </div>
            <div className="flex flex-col gap-3 min-[420px]:flex-row">
              <Button asChild size="lg" className="h-12 px-6 text-base font-semibold">
                <Link href="/auth/registro">Registrarme</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base font-medium">
                <Link href="/solicitud">Solicitar embarcación</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} NauticAdmin
          </p>
          <p className="text-sm text-muted-foreground">Administración de náuticas</p>
        </div>
      </footer>
    </div>
  );
}
