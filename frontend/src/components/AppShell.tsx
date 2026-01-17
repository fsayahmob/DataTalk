"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { DatasetHeader } from "@/components/DatasetHeader";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  return (
    <div className="h-screen flex bg-background">
      <Sidebar collapsed={sidebarCollapsed} onCollapse={setSidebarCollapsed} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DatasetHeader />
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
