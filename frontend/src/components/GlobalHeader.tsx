"use client";

import { usePathname } from "next/navigation";
import { t } from "@/hooks/useTranslation";

// Clés i18n par route
const PAGE_I18N_KEYS: Record<string, { titleKey: string; subtitleKey: string }> = {
  "/": { titleKey: "home.welcome", subtitleKey: "home.subtitle" },
  "/catalog": { titleKey: "catalog.title", subtitleKey: "catalog.subtitle" },
  "/analytics": { titleKey: "home.welcome", subtitleKey: "home.subtitle" },
  "/settings": { titleKey: "settings.title", subtitleKey: "settings.subtitle" },
  "/runs": { titleKey: "runs.title", subtitleKey: "runs.subtitle" },
};

interface GlobalHeaderProps {
  actions?: React.ReactNode;
}

export function GlobalHeader({ actions }: GlobalHeaderProps) {
  const pathname = usePathname();
  const keys = PAGE_I18N_KEYS[pathname] || PAGE_I18N_KEYS["/"];
  const title = t(keys.titleKey);
  const subtitle = t(keys.subtitleKey);

  return (
    <header className="h-14 border-b border-border/50 px-4 flex items-center justify-between bg-background">
      <div>
        <h1 className="font-semibold text-foreground">{title}</h1>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {actions && (
        <div className="flex items-center gap-4">
          {actions}
        </div>
      )}
    </header>
  );
}
