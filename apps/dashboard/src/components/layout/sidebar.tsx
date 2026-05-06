"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSystems } from "@/hooks/use-data";
import {
  LayoutDashboard,
  Users,
  PhoneCall,
  History,
  ListOrdered,
  Server,
  Settings,
  Phone,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Übersicht", href: "/", icon: LayoutDashboard },
  { label: "Warteschlangen", href: "/queues", icon: ListOrdered },
  { label: "Nebenstellen", href: "/extensions", icon: Users },
  { label: "Aktive Anrufe", href: "/calls", icon: PhoneCall },
  { label: "Anrufprotokoll", href: "/calls/history", icon: History },
  { label: "Statistiken", href: "/statistics", icon: BarChart2 },
  { label: "System", href: "/system", icon: Server },
  { label: "Einstellungen", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: systemsData } = useSystems();
  const activeSystem = systemsData?.systems?.find((s) => s.id === systemsData.activeSystemId);

  return (
    <aside className="flex h-screen w-56 flex-shrink-0 flex-col border-r border-glass bg-surface-glass backdrop-blur-xl">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-glass px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-inset ring-primary/20 shadow-[0_0_12px_rgba(240,128,23,0.15)]">
          <Phone className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="text-sm font-bold text-heading">3CX</div>
          <div className="text-xs text-muted">Dashboard</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => {
            // Aktiv wenn exakter Match ODER Unterpfad – aber nicht wenn ein spezifischerer
            // Nav-Eintrag ebenfalls passt (/calls soll nicht aktiv sein wenn /calls/history aktiv)
            const pathMatches =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(item.href + "/");
            const moreSpecificExists = navItems.some(
              (other) =>
                other.href !== item.href &&
                other.href.length > item.href.length &&
                (pathname === other.href || pathname.startsWith(other.href + "/"))
            );
            const isActive = pathMatches && !moreSpecificExists;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 shadow-[0_0_20px_rgba(240,128,23,0.08)]"
                      : "text-secondary hover:bg-surface-muted hover:text-heading"
                  )}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer – aktive Anlage */}
      <div className="border-t border-glass px-4 py-3">
        {activeSystem ? (
          <>
            <p className="truncate text-xs font-medium text-secondary">{activeSystem.name}</p>
            <p className="truncate text-xs text-muted">{activeSystem.url}</p>
          </>
        ) : (
          <>
            <p className="text-xs text-muted">Arconda Systems AG</p>
            <p className="text-xs text-muted">Keine Anlage konfiguriert</p>
          </>
        )}
      </div>
    </aside>
  );
}
