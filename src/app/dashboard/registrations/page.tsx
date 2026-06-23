import { PendingRegistrations } from "@/components/admin/PendingRegistrations";

export default function RegistrationsPage() {
  return (
    <div className="flex flex-col gap-6 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-headline">Solicitudes</h1>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-semibold mb-2">Solicitudes de registro (nuevos jugadores)</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Formularios de preinscripción de jugadores para que se unan a tu escuela.
        </p>
        <PendingRegistrations />
      </div>
    </div>
  );
}
