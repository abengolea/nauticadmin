const STATS = [
  { label: "Clientes activos", value: "186" },
  { label: "Embarcaciones", value: "214" },
  { label: "Amarras ocupadas", value: "168" },
  { label: "Cobros del mes", value: "ARS 4,2 M" },
];

const ROWS = [
  { name: "Marina López", boat: "Santa Rita", slip: "A-12", status: "Al día" },
  { name: "Héctor Paz", boat: "Luna Nueva", slip: "B-04", status: "Al día" },
  { name: "Sofía Rivas", boat: "Don Segundo", slip: "C-19", status: "Pendiente" },
  { name: "Club Náutico Sur", boat: "Guardería 08", slip: "D-02", status: "Al día" },
];

export function ProductPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_18px_50px_-24px_hsl(210_63%_18%/0.45)]">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <p className="ml-2 truncate text-xs text-muted-foreground">Panel de administración</p>
      </div>
      <div className="grid min-h-[280px] grid-cols-1 sm:grid-cols-[9.5rem_1fr]">
        <aside className="hidden border-r border-border bg-secondary/50 p-3 sm:block">
          <p className="px-2 font-headline text-sm font-semibold text-foreground">NauticAdmin</p>
          <ul className="mt-4 space-y-1 text-sm">
            {["Panel", "Clientes", "Embarcaciones", "Cobros", "Gastos"].map((item, i) => (
              <li
                key={item}
                className={`rounded-md px-2 py-1.5 ${
                  i === 0 ? "bg-primary text-primary-foreground" : "text-foreground/70"
                }`}
              >
                {item}
              </li>
            ))}
          </ul>
        </aside>
        <div className="min-w-0 p-3 sm:p-4">
          <p className="font-headline text-lg font-semibold tracking-[-0.02em]">Panel principal</p>
          <p className="text-xs text-muted-foreground">Resumen operativo del mes</p>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-background px-2.5 py-2">
                <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                <p className="font-headline text-base font-semibold tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-2.5 py-2 font-medium">Cliente</th>
                  <th className="px-2.5 py-2 font-medium">Embarcación</th>
                  <th className="hidden px-2.5 py-2 font-medium sm:table-cell">Amarra</th>
                  <th className="px-2.5 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.name} className="border-t border-border">
                    <td className="px-2.5 py-2 font-medium">{row.name}</td>
                    <td className="px-2.5 py-2 text-foreground/75">{row.boat}</td>
                    <td className="hidden px-2.5 py-2 tabular-nums text-foreground/75 sm:table-cell">
                      {row.slip}
                    </td>
                    <td className="px-2.5 py-2">
                      <span
                        className={
                          row.status === "Al día"
                            ? "text-primary"
                            : "text-amber-800 dark:text-amber-400"
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClientPortalPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_18px_50px_-24px_hsl(210_63%_18%/0.35)]">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <p className="text-xs text-muted-foreground">Portal del cliente</p>
        <p className="font-headline text-lg font-semibold">Mi ficha</p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Embarcación</p>
          <p className="mt-1 font-medium">Santa Rita · matrícula 4-BA-2281</p>
          <p className="mt-1 text-sm text-foreground/70">Amarra A-12 · guardería</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Estado de cuenta</p>
          <p className="mt-1 font-medium">Cuota septiembre · al día</p>
          <p className="mt-1 text-sm text-foreground/70">Último cobro 04/09/2026</p>
        </div>
      </div>
    </div>
  );
}
