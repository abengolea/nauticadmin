"use client";

import { cn } from "@/lib/utils";

/** Logo placeholder para NauticAdmin. Reemplazar por imagen cuando exista. */
export function NauticAdminLogo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm",
        className
      )}
      title="NauticAdmin"
    >
      NA
    </div>
  );
}
