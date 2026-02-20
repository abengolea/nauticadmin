import { Loader2 } from "lucide-react";

export default function PlayersLoading() {
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-9 w-32 animate-pulse rounded bg-muted" />
        <div className="h-10 w-36 animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Cargando clientes…</p>
        </div>
      </div>
    </div>
  );
}
