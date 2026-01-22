"use client";

/**
 * LanguageProvider - Wrapper de compatibilité
 *
 * MIGRATION: Ce fichier redirige maintenant vers useLanguageStore (Zustand)
 * Les anciens imports continuent de fonctionner pour backward compatibility.
 *
 * Architecture: Frontend Agnostic
 * - Le frontend est la source de vérité pour la langue
 * - Persistance dans localStorage via Zustand persist
 * - Le backend s'adapte via Accept-Language header
 */

import { ReactNode } from "react";
import { useLanguageStore, getLocale, type Locale } from "@/stores/useLanguageStore";

// Re-export types pour backward compatibility
export type { Locale } from "@/stores/useLanguageStore";

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/**
 * LanguageProvider - Force le re-render de l'arbre quand la locale change
 *
 * Le trick: key={locale} force React à re-monter tout l'arbre enfant
 * quand la locale change, ce qui fait que t() retourne les nouvelles traductions.
 *
 * display:contents fait que le div n'affecte pas le layout CSS.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useLanguageStore((state) => state.locale);

  return (
    <div key={locale} style={{ display: "contents" }}>
      {children}
    </div>
  );
}

/**
 * Hook legacy - redirige vers Zustand store
 */
export function useLanguage(): LanguageContextType {
  const locale = useLanguageStore((state) => state.locale);
  const setLocale = useLanguageStore((state) => state.setLocale);
  return { locale, setLocale };
}

/**
 * Pour usage hors React (API calls) - redirige vers store
 */
export function getStoredLocale(): Locale {
  return getLocale();
}

// Legacy export - plus utilisé mais garde pour compat
export const LanguageContext = null;
