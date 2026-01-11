"use client";

import { usePathname } from "next/navigation";

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
  const config = PAGE_CONFIG[pathname] || PAGE_CONFIG["/"];

  return (
    <header className="h-14 border-b border-border/50 px-4 flex items-center justify-between bg-[hsl(260_10%_10%)]">
      <div>
        <h1 className="font-semibold text-foreground">{config.title}</h1>
        <p className="text-xs text-muted-foreground">{config.subtitle}</p>
      </div>

      {actions && (
        <div className="flex items-center gap-4">
          {actions}
        </div>
      )}
    </header>
  );
}
