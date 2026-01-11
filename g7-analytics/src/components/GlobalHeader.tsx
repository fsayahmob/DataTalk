"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import * as api from "@/lib/api";
import type { LLMStatus } from "@/lib/api";

// Titres et sous-titres par route
const PAGE_CONFIG: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "G7 Analytics", subtitle: "Text-to-SQL Dashboard" },
  "/catalog": { title: "Catalogue de Données", subtitle: "Visualisation ERD du schéma DuckDB" },
  "/analytics": { title: "G7 Analytics", subtitle: "Text-to-SQL Dashboard" },
  "/settings": { title: "Paramètres", subtitle: "Configuration de l'application" },
};

interface GlobalHeaderProps {
  actions?: React.ReactNode;
}

export function GlobalHeader({ actions }: GlobalHeaderProps) {
  const pathname = usePathname();
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);

  useEffect(() => {
    api.fetchLLMStatus().then(setLlmStatus);
  }, [pathname]); // Refresh on route change

  const config = PAGE_CONFIG[pathname] || PAGE_CONFIG["/"];

  return (
    <header className="h-14 border-b border-border/50 px-4 flex items-center justify-between bg-[hsl(260_10%_10%)]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/60 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
          <span className="text-primary-foreground font-bold text-lg">G7</span>
        </div>
        <div>
          <h1 className="font-semibold text-foreground">{config.title}</h1>
          <p className="text-xs text-muted-foreground">{config.subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {actions}

        <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full bg-secondary/50">
          <span
            className={`w-2 h-2 rounded-full ${
              llmStatus?.status === "ok"
                ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                : "bg-red-500 shadow-sm shadow-red-500/50"
            }`}
          />
          <span className="text-muted-foreground text-xs">
            {llmStatus?.model || "Not configured"}
          </span>
        </div>
      </div>
    </header>
  );
}
