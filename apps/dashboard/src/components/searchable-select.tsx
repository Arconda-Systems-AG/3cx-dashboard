"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  /** Label für den Leerwert value="" (z.B. "Alle Abteilungen") */
  allLabel?: string;
  placeholder?: string;
  className?: string;
}

/** Durchsuchbares Dropdown — für viele Optionen (z.B. hunderte Abteilungen). */
export function SearchableSelect({
  value,
  onChange,
  options,
  allLabel = "Alle",
  placeholder = "Suchen…",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const all = useMemo(() => [{ value: "", label: allLabel }, ...options], [options, allLabel]);
  const selected = all.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((o) => o.label.toLowerCase().includes(q)) : all;
  }, [all, query]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-primary/30 bg-surface-solid px-3 py-1.5 text-sm text-heading transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <span className="truncate">{selected?.label ?? allLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[16rem] overflow-hidden rounded-lg border border-glass bg-surface-solid shadow-xl">
          <div className="flex items-center gap-2 border-b border-glass px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-sm text-body placeholder:text-muted focus:outline-none"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted">Nichts gefunden</li>
            )}
            {filtered.map((o) => (
              <li key={o.value || "__all__"}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-primary/10 ${
                    o.value === value ? "font-medium text-primary" : "text-body"
                  }`}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
