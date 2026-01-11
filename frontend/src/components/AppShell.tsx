"use client";

import { useState, createContext, useContext } from "react";
import { Sidebar } from "@/components/Sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";

// Context pour les actions du header (permettre aux pages d'injecter des boutons)
interface HeaderActionsContextType {
  actions: React.ReactNode;
  setActions: (actions: React.ReactNode) => void;
}

const HeaderActionsContext = createContext<HeaderActionsContextType>({
  actions: null,
  setActions: () => {},
});

export function useHeaderActions() {
  return useContext(HeaderActionsContext);
}

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [headerActions, setHeaderActions] = useState<React.ReactNode>(null);

  return (
    <HeaderActionsContext.Provider value={{ actions: headerActions, setActions: setHeaderActions }}>
      <div className="h-screen flex bg-background">
        <Sidebar collapsed={sidebarCollapsed} onCollapse={setSidebarCollapsed} />
        <main className="flex-1 flex flex-col overflow-hidden">
          <GlobalHeader actions={headerActions} />
          {children}
        </main>
      </div>
    </HeaderActionsContext.Provider>
  );
}
