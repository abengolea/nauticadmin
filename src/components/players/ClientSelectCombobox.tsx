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

const MIN_QUERY_CHARS = 2;
const MAX_RESULTS = 50;

/**
 * Selector de cliente con búsqueda inline (sin Popover).
 * El texto tipeado vive en `query` siempre: no se borra si se cierra la lista.
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
  const prevValueRef = React.useRef(value);

  const selectedPlayer = players.find((p) => p.id === value);

  React.useEffect(() => {
    if (prevValueRef.current === value) return;
    prevValueRef.current = value;
    if (!value) {
      if (document.activeElement !== inputRef.current) {
        setQuery("");
        setOpen(false);
      }
      return;
    }
    if (selectedPlayer && document.activeElement !== inputRef.current) {
      setQuery(selectedPlayer.displayName);
    }
  }, [value, selectedPlayer]);

  const normalizedQuery = normalizeString(query);
  const canSearch = normalizedQuery.length >= MIN_QUERY_CHARS;

  const filtered = React.useMemo(() => {
    if (!canSearch) return [];
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const matches: ClientSelectOption[] = [];
    for (const p of players) {
      const name = normalizeString(p.displayName);
      if (tokens.every((t) => name.includes(t))) {
        matches.push(p);
        if (matches.length >= MAX_RESULTS) break;
      }
    }
    return matches;
  }, [players, normalizedQuery, canSearch]);

  const handleSelect = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    onChange(playerId);
    setQuery(player?.displayName ?? "");
    setOpen(false);
    inputRef.current?.blur();
  };

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

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
          placeholder={selectedPlayer ? placeholder : searchPlaceholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onClick={() => {
            if (!disabled) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              return;
            }
            if (e.key === "Tab") {
              setOpen(false);
              return;
            }
            if (e.key === "Enter" && open && filtered.length === 1) {
              e.preventDefault();
              handleSelect(filtered[0].id);
            }
          }}
          className={cn(
            "pl-8 pr-9",
            !query && "text-muted-foreground"
          )}
        />
        <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-[min(280px,50vh)] w-full overflow-y-auto rounded-md border bg-background text-popover-foreground shadow-md">
          {!canSearch ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Escribí al menos {MIN_QUERY_CHARS} letras para buscar
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
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
