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
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import Image from "next/image";

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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative flex h-screen flex-shrink-0 flex-col border-r border-glass bg-surface-glass backdrop-blur-xl transition-all duration-300",
        collapsed ? "w-14" : "w-56"
      )}
    >
      {/* Toggle-Button */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-glass bg-surface-glass text-muted shadow-md hover:text-heading transition-colors"
        aria-label={collapsed ? "Menü aufklappen" : "Menü einklappen"}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      {/* Arconda Logo */}
      <div className={cn(
        "flex flex-col items-center border-b border-glass pt-4 pb-3",
        collapsed ? "px-2" : "px-4"
      )}>
        <Image
          src="/arconda-logo.png"
          alt="Arconda"
          width={collapsed ? 24 : 130}
          height={collapsed ? 24 : 34}
          className="object-contain transition-all duration-300"
          priority
        />
        {!collapsed && (
          <div className="mt-3 flex items-center gap-2.5 self-start">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-inset ring-primary/20 shadow-[0_0_12px_rgba(240,128,23,0.15)]">
              <Phone className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-bold text-heading">3CX</div>
              <div className="text-xs text-muted">Dashboard</div>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="mt-2 flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-inset ring-primary/20">
            <Phone className="h-3.5 w-3.5 text-primary" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => {
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
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    collapsed && "justify-center px-2",
                    isActive
                      ? "bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 shadow-[0_0_20px_rgba(240,128,23,0.08)]"
                      : "text-secondary hover:bg-surface-muted hover:text-heading"
                  )}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer – aktive Anlage */}
      {!collapsed && (
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
      )}
    </aside>
  );
}
