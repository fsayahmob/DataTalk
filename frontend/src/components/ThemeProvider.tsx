"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

// Theme style types
export type ThemeStyle = "corporate" | "gcp" | "linux" | "bloomberg" | "github" | "dracula";

export interface ThemeStyleConfig {
  id: ThemeStyle;
  name: string;
  description: string;
}

export const THEME_STYLES: ThemeStyleConfig[] = [
  { id: "corporate", name: "Corporate", description: "Blue corporate style (default)" },
  { id: "gcp", name: "Google Cloud", description: "Google Cloud Console colors" },
  { id: "linux", name: "Ubuntu", description: "Ubuntu terminal aesthetic" },
  { id: "bloomberg", name: "Bloomberg", description: "Finance terminal dark mode" },
  { id: "github", name: "GitHub", description: "GitHub design system" },
  { id: "dracula", name: "Dracula", description: "Popular dev color scheme" },
];

// Context for theme style
interface ThemeStyleContextValue {
  style: ThemeStyle;
  setStyle: (style: ThemeStyle) => void;
  styles: ThemeStyleConfig[];
}

const ThemeStyleContext = createContext<ThemeStyleContextValue | null>(null);

// Hook to use theme style
export function useThemeStyle() {
  const ctx = useContext(ThemeStyleContext);
  if (!ctx) {
    throw new Error("useThemeStyle must be used within ThemeProvider");
  }
  return ctx;
}

// Provider component
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [style, setStyleState] = useState<ThemeStyle>("corporate");
  const [mounted, setMounted] = useState(false);

  // Load saved style from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme-style") as ThemeStyle | null;
    if (saved && THEME_STYLES.some((s) => s.id === saved)) {
      setStyleState(saved);
    }
  }, []);

  // Apply style to document and persist
  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute("data-theme-style", style);
      localStorage.setItem("theme-style", style);
    }
  }, [style, mounted]);

  const setStyle = useCallback((newStyle: ThemeStyle) => {
    setStyleState(newStyle);
  }, []);

  return (
    <ThemeStyleContext.Provider value={{ style, setStyle, styles: THEME_STYLES }}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </NextThemesProvider>
    </ThemeStyleContext.Provider>
  );
}
