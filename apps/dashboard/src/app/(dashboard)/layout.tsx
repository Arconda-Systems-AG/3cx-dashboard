"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { useWebSocket } from "@/hooks/use-websocket";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useWebSocket();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-screen-2xl animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
