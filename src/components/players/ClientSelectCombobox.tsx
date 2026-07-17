"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeString } from "@/lib/text-normalize";

export type ClientSelectOption = {
  id: string;
  displayName: string;
};

type ClientSelectComboboxProps = {
  value: string;
  onChange: (playerId: string) => void;
  players: ClientSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  fullWidth?: boolean;
};

/**
 * Selector de cliente con búsqueda inline (sin Popover).
 * Pensado para funcionar dentro de Dialog sin pelearse con el focus trap.
 */
export function ClientSelectCombobox({
  value,
  onChange,
  players,
  placeholder = "Elegí un cliente",
  searchPlaceholder = "Escribí apellido o nombre…",
  disabled,
  id,
  className,
  fullWidth = true,
}: ClientSelectComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selectedPlayer = players.find((p) => p.id === value);

  const filtered = React.useMemo(() => {
    const q = normalizeString(query);
    if (!q) return players;
    const tokens = q.split(/\s+/).filter(Boolean);
    return players.filter((p) => {
      const name = normalizeString(p.displayName);
      return tokens.every((t) => name.includes(t));
    });
  }, [players, query]);

  const handleSelect = (playerId: string) => {
    onChange(playerId);
    setOpen(false);
    setQuery("");
  };

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery("");
  };

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  const inputValue = open ? query : selectedPlayer?.displayName ?? "";

  return (
    <div
      ref={rootRef}
      className={cn("relative", fullWidth && "w-full", className)}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          id={id}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={open || !selectedPlayer ? searchPlaceholder : placeholder}
          value={inputValue}
          onFocus={openList}
          onClick={openList}
          onChange={(e) => {
            setOpen(true);
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setQuery("");
              inputRef.current?.blur();
              return;
            }
            if (e.key === "Enter" && open && filtered.length === 1) {
              e.preventDefault();
              handleSelect(filtered[0].id);
            }
          }}
          className={cn(
            "pl-8 pr-9",
            !selectedPlayer && !open && "text-muted-foreground"
          )}
        />
        <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-[min(280px,50vh)] w-full overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin resultados
            </p>
          ) : (
            <ul className="p-1" role="listbox">
              {filtered.map((p) => {
                const selected = p.id === value;
                return (
                  <li key={p.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                        selected && "bg-accent"
                      )}
                      onMouseDown={(e) => {
                        // Evita que el input pierda foco antes del click
                        e.preventDefault();
                      }}
                      onClick={() => handleSelect(p.id)}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          selected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{p.displayName}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
