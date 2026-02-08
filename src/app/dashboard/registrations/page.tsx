import { PendingRegistrations } from "@/components/admin/PendingRegistrations";

export default function RegistrationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Solicitudes de Registro</h1>
      </div>
      <p className="text-muted-foreground">
        Aprueba o rechaza las solicitudes de nuevos jugadores para que se unan a tu escuela.
      </p>
      <PendingRegistrations />
    </div>
  );
}
