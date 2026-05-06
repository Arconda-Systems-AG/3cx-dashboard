"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps {
  value: string | number;
  onChange: (value: string | number) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export function Select({ value, onChange, options, placeholder = "Wählen…", className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-glass bg-input px-3 py-2 text-sm text-body hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <span className={selected ? "text-body" : "text-muted"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-glass bg-surface-solid shadow-2xl">
          {placeholder && (
            <li
              onClick={() => { onChange(""); setOpen(false); }}
              className="cursor-pointer px-3 py-2 text-sm text-muted hover:bg-primary/10"
            >
              {placeholder}
            </li>
          )}
          {options.map((opt) => (
            <li
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                "cursor-pointer px-3 py-2 text-sm hover:bg-primary/10",
                String(opt.value) === String(value) ? "text-primary" : "text-body"
              )}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
