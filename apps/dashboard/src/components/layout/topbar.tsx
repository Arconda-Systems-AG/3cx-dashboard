"use client";

import { useState, useRef, useEffect } from "react";
import { ThemeToggle, LedIndicator } from "@3cx-dash/ui";
import { useCallsStore } from "@/store/calls-store";
import { useHealth, useSystems, useSettings } from "@/hooks/use-data";
import { RefreshCw, ChevronDown, Phone, Check } from "lucide-react";
import { mutate } from "swr";

const wsStatusLabel: Record<string, string> = {
  connected: "WebSocket",
  connecting: "Verbindet...",
  disconnected: "Getrennt",
  error: "WS Fehler",
};

const wsStatusLed: Record<string, "online" | "offline" | "warning"> = {
  connected: "online",
  connecting: "warning",
  disconnected: "offline",
  error: "offline",
};

export function Topbar() {
  const wsStatus = useCallsStore((s) => s.wsStatus);
  const lastWsEvent = useCallsStore((s) => s.lastWsEvent);
  const { data: health } = useHealth();
  const { data: systemsData, mutate: mutateSystems } = useSystems();
  const { data: settings } = useSettings();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const systems = systemsData?.systems ?? [];
  const activeSystemId = systemsData?.activeSystemId ?? "";
  const activeSystem = systems.find((s) => s.id === activeSystemId);

  // Klick außerhalb schließt Dropdown
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function activateSystem(id: string) {
    setOpen(false);
    await fetch(`/api/systems/${id}/activate`, { method: "POST" });
    mutateSystems();
    // Alle Daten neu laden mit neuer Anlage
    mutate(() => true, undefined, { revalidate: true });
  }

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-glass bg-surface-glass px-6 backdrop-blur-xl">
      {/* Links: System-Switcher + Verbindungsanzeigen */}
      <div className="flex items-center gap-3">
        {/* System-Switcher Dropdown */}
        {systems.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setOpen((v) => !v)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition-all ${
                open
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-glass bg-surface-glass text-secondary hover:text-heading"
              }`}
            >
              <Phone className="h-3.5 w-3.5" />
              <span className="max-w-[140px] truncate font-medium">
                {activeSystem?.name ?? "Anlage wählen"}
              </span>
              {systems.length > 1 && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />}
            </button>

            {open && systems.length > 1 && (
              <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-glass bg-surface shadow-2xl backdrop-blur-xl">
                <div className="p-1.5">
                  <p className="px-2 py-1 text-xs font-medium text-muted">Telefonanlage wechseln</p>
                  {systems.map((sys) => {
                    const isActive = sys.id === activeSystemId;
                    return (
                      <button
                        key={sys.id}
                        onClick={() => activateSystem(sys.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-all ${
                          isActive
                            ? "bg-primary/15 text-primary"
                            : "text-secondary hover:bg-surface-muted hover:text-heading"
                        }`}
                      >
                        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${isActive ? "bg-primary" : "bg-border-subtle"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{sys.name}</p>
                          <p className="truncate text-xs text-muted">{sys.url}</p>
                        </div>
                        {isActive && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Trennlinie */}
        {systems.length > 0 && <div className="h-4 w-px bg-border-subtle" />}

        {/* 3CX Verbindungsstatus */}
        <LedIndicator
          status={health?.connected ? "online" : "offline"}
          label={health?.connected ? "Verbunden" : "Nicht verbunden"}
        />
        <div className="h-4 w-px bg-border-subtle" />
        <LedIndicator
          status={wsStatusLed[wsStatus] ?? "offline"}
          label={wsStatusLabel[wsStatus] ?? wsStatus}
          pulse={wsStatus === "connected"}
        />
        {lastWsEvent && (
          <span className="hidden text-xs text-muted md:block">{lastWsEvent}</span>
        )}
      </div>

      {/* Rechts: Kunden-Logo + Refresh + Theme Toggle */}
      <div className="flex items-center gap-3">
        {/* Kunden-Logo / Name */}
        {(settings?.customerLogoUrl || settings?.customerName) && (
          <div className="flex items-center gap-2 border-r border-glass pr-3">
            {settings.customerLogoUrl ? (
              <img
                src={settings.customerLogoUrl}
                alt={settings.customerName ?? "Logo"}
                className="h-11 max-w-[160px] object-contain"
              />
            ) : (
              <span className="text-sm font-semibold text-heading">{settings.customerName}</span>
            )}
          </div>
        )}
        <button
          onClick={() => mutate(() => true, undefined, { revalidate: true })}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-glass bg-surface-glass text-secondary transition-all hover:text-heading"
          title="Alle Daten neu laden"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
