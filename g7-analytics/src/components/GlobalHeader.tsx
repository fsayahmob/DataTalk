"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsIcon } from "@/components/icons";
import * as api from "@/lib/api";

// Titres et sous-titres par route
const PAGE_CONFIG: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "G7 Analytics", subtitle: "Text-to-SQL Dashboard" },
  "/catalog": { title: "Catalogue de Données", subtitle: "Visualisation ERD du schéma DuckDB" },
  "/analytics": { title: "G7 Analytics", subtitle: "Text-to-SQL Dashboard" },
};

interface GlobalHeaderProps {
  // Actions optionnelles à afficher à droite (workflow buttons, etc.)
  actions?: React.ReactNode;
}

export function GlobalHeader({ actions }: GlobalHeaderProps) {
  const pathname = usePathname();
  const [apiStatus, setApiStatus] = useState<"ok" | "error" | "unknown">("unknown");
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");

  // Charger le status API au démarrage
  useEffect(() => {
    api.checkApiStatus().then(setApiStatus);
  }, []);

  const handleSaveApiKey = useCallback(async () => {
    await api.saveApiKey(apiKey);
    setApiKey("");
    setShowSettings(false);
    api.checkApiStatus().then(setApiStatus);
  }, [apiKey]);

  const config = PAGE_CONFIG[pathname] || PAGE_CONFIG["/"];

  return (
    <>
      <header className="h-14 border-b border-border/50 px-4 flex items-center justify-between bg-[hsl(260_10%_10%)]">
        {/* Logo + Titre */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/60 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-primary-foreground font-bold text-lg">G7</span>
          </div>
          <div>
            <h1 className="font-semibold text-foreground">{config.title}</h1>
            <p className="text-xs text-muted-foreground">{config.subtitle}</p>
          </div>
        </div>

        {/* Actions spécifiques + Status API + Settings */}
        <div className="flex items-center gap-4">
          {/* Actions passées par la page */}
          {actions}

          {/* Statut API */}
          <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full bg-secondary/50">
            <span
              className={`w-2 h-2 rounded-full ${
                apiStatus === "ok"
                  ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                  : apiStatus === "error"
                  ? "bg-red-500 shadow-sm shadow-red-500/50"
                  : "bg-amber-500 shadow-sm shadow-amber-500/50"
              }`}
            />
            <span className="text-muted-foreground text-xs">gemini-2.0-flash</span>
          </div>

          {/* Bouton settings */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="h-9 w-9 p-0"
          >
            <SettingsIcon size={16} />
          </Button>
        </div>
      </header>

      {/* Panel Settings */}
      {showSettings && (
        <div className="border-b p-4 bg-secondary/50">
          <div className="max-w-md">
            <h3 className="font-medium mb-2">Configuration API Gemini</h3>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Clé API Gemini"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button onClick={handleSaveApiKey} disabled={!apiKey}>
                Sauvegarder
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
