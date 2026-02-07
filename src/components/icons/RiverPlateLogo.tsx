import { cn } from "@/lib/utils";
import Image from "next/image";

export function RiverPlateLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/river-plate-logo.png"
      alt="Escuela de River Plate Logo"
      width={40}
      height={40}
      className={cn("", className)}
    />
  );
}
