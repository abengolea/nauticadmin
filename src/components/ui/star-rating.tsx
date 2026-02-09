"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StarRatingProps {
  value: number;
  max?: number;
  onValueChange: (value: number) => void;
  className?: string;
  /** Tamaño de cada estrella en px */
  size?: number;
  disabled?: boolean;
}

export function StarRating({
  value,
  max = 5,
  onValueChange,
  className,
  size = 28,
  disabled = false,
}: StarRatingProps) {
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="group"
      aria-label={`Calificación: ${value} de ${max}`}
    >
      {Array.from({ length: max }, (_, i) => {
        const starValue = i + 1;
        const filled = value >= starValue;
        return (
          <button
            key={i}
            type="button"
            onClick={() => !disabled && onValueChange(starValue)}
            disabled={disabled}
            className={cn(
              "p-0.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              !disabled && "hover:scale-110 cursor-pointer",
              disabled && "cursor-default"
            )}
            aria-label={`${starValue} de ${max}`}
            aria-pressed={value === starValue}
          >
            <Star
              size={size}
              className={cn(
                "transition-colors",
                filled
                  ? "fill-amber-400 text-amber-500"
                  : "fill-transparent text-muted-foreground/40"
              )}
              strokeWidth={1.5}
            />
          </button>
        );
      })}
    </div>
  );
}
