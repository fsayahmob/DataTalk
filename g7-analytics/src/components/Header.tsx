"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface HeaderProps {
  apiStatus: "ok" | "error" | "unknown";
  showSettings: boolean;
  onShowSettingsChange: (show: boolean) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onSaveApiKey: () => void;
}

export function Header({
  apiStatus,
  showSettings,
  onShowSettingsChange,
  apiKey,
  onApiKeyChange,
  onSaveApiKey,
}: HeaderProps) {
  return (
    <>
      <header className="h-14 border-b border-border/50 px-4 flex items-center justify-between bg-[hsl(260_10%_10%)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/60 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-primary-foreground font-bold text-lg">G7</span>
          </div>
          <div>
            <h1 className="font-semibold text-foreground">G7 Analytics</h1>
            <p className="text-xs text-muted-foreground">Text-to-SQL Dashboard</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
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
            onClick={() => onShowSettingsChange(!showSettings)}
            className="h-9 w-9 p-0"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
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
                onChange={(e) => onApiKeyChange(e.target.value)}
              />
              <Button onClick={onSaveApiKey} disabled={!apiKey}>
                Sauvegarder
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
