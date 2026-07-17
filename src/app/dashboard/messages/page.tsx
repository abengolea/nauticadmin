"use client";

import { MassMessageForm } from "@/components/admin/MassMessageForm";

export default function MessagesPage() {
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-headline">Mensajes</h1>
        <p className="text-muted-foreground">
          Enviá correos masivos a los clientes desde la aplicación.
        </p>
      </div>
      <MassMessageForm />
    </div>
  );
}
