import { cn } from "@/lib/utils";

/** Gallardete náutico — marca de NauticAdmin. */
export function NauticAdminLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("shrink-0 text-primary", className)}
      aria-hidden
    >
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <path d="M8 10.5h13.2l-3.8 5.5 3.8 5.5H8V10.5z" fill="hsl(var(--primary-foreground))" />
    </svg>
  );
}
