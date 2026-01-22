import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

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

const DEFAULT_STYLE: ThemeStyle = "corporate";

export interface ThemeStore {
  style: ThemeStyle;
  styles: ThemeStyleConfig[];
  setStyle: (style: ThemeStyle) => void;
}

export const useThemeStore = create<ThemeStore>()(
  devtools(
    persist(
      (set) => ({
        style: DEFAULT_STYLE,
        styles: THEME_STYLES,
        setStyle: (style: ThemeStyle) => {
          if (THEME_STYLES.some((s) => s.id === style)) {
            // Apply to document
            if (typeof document !== "undefined") {
              document.documentElement.setAttribute("data-theme-style", style);
            }
            set({ style });
          }
        },
      }),
      {
        name: "theme-style", // Same key as old localStorage for seamless migration
        onRehydrateStorage: () => (state) => {
          // Apply theme to document on hydration
          if (state && typeof document !== "undefined") {
            document.documentElement.setAttribute("data-theme-style", state.style);
          }
        },
      }
    ),
    { name: "ThemeStore" }
  )
);

/**
 * For usage outside React (utilities, other stores)
 */
export const getThemeStyle = () => useThemeStore.getState().style;
