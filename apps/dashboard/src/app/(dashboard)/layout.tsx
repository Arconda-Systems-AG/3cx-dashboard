"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { useWebSocket } from "@/hooks/use-websocket";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useWebSocket();

  useEffect(() => {
    const tick = () => fetch("/api/cron/tick").catch(() => {});
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-screen-2xl animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
