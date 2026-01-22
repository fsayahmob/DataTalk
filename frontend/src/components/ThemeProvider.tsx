"use client";

/**
 * ThemeProvider - Wrapper de compatibilité
 *
 * MIGRATION: Ce fichier redirige maintenant vers useThemeStore (Zustand)
 * pour la gestion du "theme style" (corporate, gcp, linux, etc.)
 *
 * Le mode light/dark reste géré par next-themes (NextThemesProvider).
 */

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useEffect, useSyncExternalStore } from "react";
import { useThemeStore } from "@/stores/useThemeStore";

// Re-export types and constants for backward compatibility
export type { ThemeStyle, ThemeStyleConfig } from "@/stores/useThemeStore";
export { THEME_STYLES } from "@/stores/useThemeStore";

// Hydration-safe mounting detection
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * ThemeProvider - Conserve NextThemesProvider pour light/dark mode
 * Le theme style est maintenant géré par Zustand (useThemeStore)
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const style = useThemeStore((state) => state.style);
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

  // Apply theme style to document on mount/change
  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute("data-theme-style", style);
    }
  }, [style, mounted]);

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
