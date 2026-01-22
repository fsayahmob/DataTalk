import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type Locale = "fr" | "en";

export interface LanguageStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const SUPPORTED_LOCALES: Locale[] = ["fr", "en"];
const DEFAULT_LOCALE: Locale = "fr";

function getBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const browserLang = navigator.language.slice(0, 2);
  return browserLang === "en" ? "en" : DEFAULT_LOCALE;
}

export const useLanguageStore = create<LanguageStore>()(
  devtools(
    persist(
      (set) => ({
        locale: DEFAULT_LOCALE,
        setLocale: (locale: Locale) => {
          if (SUPPORTED_LOCALES.includes(locale)) {
            set({ locale });
          }
        },
      }),
      {
        name: "language", // Même clé que LanguageProvider pour migration seamless
        onRehydrateStorage: () => (state) => {
          // Si pas de valeur stockée, utiliser browser locale
          if (state && !state.locale) {
            state.setLocale(getBrowserLocale());
          }
        },
      }
    ),
    { name: "LanguageStore" }
  )
);

/**
 * Pour usage hors React (API calls, autres stores)
 */
export const getLocale = () => useLanguageStore.getState().locale;
