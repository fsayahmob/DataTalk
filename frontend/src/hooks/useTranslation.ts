/**
 * Hook i18n pour le frontend G7 Analytics.
 * Charge les traductions depuis les fichiers JSON locaux.
 *
 * Usage:
 *   const { t, locale } = useTranslation();
 *   t("common.save") // "Sauvegarder"
 *   t("validation.range_error", { min: 1, max: 50 }) // "Valeur entre 1 et 50"
 *
 * Architecture: Frontend Agnostic
 * - Utilise Zustand store pour la locale courante
 * - Fallback sur "fr" si hors contexte
 */

import { useLanguageStore, type Locale } from "@/stores/useLanguageStore";
import frLocale from "@/locales/fr.json";
import enLocale from "@/locales/en.json";

// Type pour les traductions (structure JSON imbriquée)
type Translations = typeof frLocale;

// Locale par défaut
const _DEFAULT_LOCALE: Locale = "fr";

// Map des locales
const locales: Record<Locale, Translations> = {
  fr: frLocale,
  en: enLocale,
};

export type { Locale };

/**
 * Récupère une valeur imbriquée par clé pointée (ex: "common.save")
 */
function getNestedValue(obj: Record<string, unknown>, key: string): string | undefined {
  const keys = key.split(".");
  let value: unknown = obj;

  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }

  return typeof value === "string" ? value : undefined;
}

/**
 * Interpole les variables dans un message.
 * Ex: "Valeur entre {min} et {max}" avec {min: 1, max: 50}
 *     -> "Valeur entre 1 et 50"
 */
function interpolate(message: string, vars?: Record<string, unknown>): string {
  if (!vars) return message;

  return message.replace(/\{(\w+)\}/g, (_, key) => {
    return vars[key] !== undefined ? String(vars[key]) : `{${key}}`;
  });
}

/**
 * Fonction de traduction.
 * Lit automatiquement la locale depuis le store Zustand.
 *
 * @param key - Clé pointée (ex: "common.save")
 * @param vars - Variables à interpoler
 * @returns Message traduit
 */
export function t(
  key: string,
  vars?: Record<string, unknown>
): string {
  // Lire la locale depuis le store Zustand
  const locale = useLanguageStore.getState().locale;

  // Essayer la locale demandée
  const translations = locales[locale];
  let message = getNestedValue(translations as unknown as Record<string, unknown>, key);

  // Fallback sur l'anglais si non trouvé
  if (message === undefined && locale !== "en") {
    message = getNestedValue(locales.en as unknown as Record<string, unknown>, key);
  }

  // Si toujours pas trouvé, retourner la clé
  if (message === undefined) {
    console.warn(`[i18n] Missing translation for key: ${key}`);
    return key;
  }

  return interpolate(message, vars);
}

/**
 * Hook useTranslation pour les composants React.
 * Utilise Zustand store pour obtenir la locale courante.
 *
 * IMPORTANT: Ce hook force un re-render quand la locale change.
 * Utilise-le dans les composants React pour avoir des traductions réactives.
 *
 * @returns Objet avec la fonction t() et la locale courante
 */
export function useTranslation() {
  // Subscribe to locale changes - forces re-render when locale changes
  const locale = useLanguageStore((state) => state.locale);

  return {
    t, // t() lit maintenant directement depuis le store
    locale,
  };
}

export default useTranslation;
