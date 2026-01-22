"use client";

import { useThemeStore, type ThemeStyle } from "@/stores";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

// Preview colors for each theme (primary, accent, background approximations)
const themePreviewColors: Record<ThemeStyle, { bg: string; primary: string; accent: string }> = {
  corporate: { bg: "#1a1d24", primary: "#4d8eff", accent: "#3dcc7a" },
  gcp: { bg: "#1f2937", primary: "#4285f4", accent: "#34a853" },
  linux: { bg: "#300a24", primary: "#e95420", accent: "#772953" },
  bloomberg: { bg: "#0a0a0a", primary: "#ff6600", accent: "#d4af37" },
  github: { bg: "#0d1117", primary: "#238636", accent: "#58a6ff" },
  dracula: { bg: "#282a36", primary: "#bd93f9", accent: "#50fa7b" },
};

export function ThemeStyleSelector() {
  const style = useThemeStore((state) => state.style);
  const setStyle = useThemeStore((state) => state.setStyle);
  const styles = useThemeStore((state) => state.styles);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {styles.map((themeConfig) => {
        const isSelected = style === themeConfig.id;
        const colors = themePreviewColors[themeConfig.id];

        return (
          <button
            key={themeConfig.id}
            onClick={() => setStyle(themeConfig.id)}
            className={cn(
              "relative flex flex-col items-start gap-2 p-3 rounded-lg border transition-all text-left",
              "hover:border-primary/50 hover:bg-muted/50",
              isSelected
                ? "border-primary ring-2 ring-primary/20 bg-muted/30"
                : "border-border"
            )}
          >
            {/* Color preview */}
            <div
              className="w-full h-8 rounded-md flex items-center justify-center gap-1.5 px-2"
              style={{ backgroundColor: colors.bg }}
            >
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: colors.primary }}
              />
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: colors.accent }}
              />
              <div className="flex-1" />
              {isSelected && (
                <Check
                  className="w-4 h-4"
                  style={{ color: colors.primary }}
                />
              )}
            </div>

            {/* Theme name */}
            <div>
              <p className="text-sm font-medium text-foreground">
                {themeConfig.name}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {themeConfig.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
