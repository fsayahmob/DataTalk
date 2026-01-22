import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { StorageService } from './storage.service';

export type Locale = 'fr' | 'en';

const STORAGE_KEY = 'locale';
const DEFAULT_LOCALE: Locale = 'fr';
const SUPPORTED_LOCALES: readonly Locale[] = ['fr', 'en'] as const;

/**
 * LocaleService - Gestion de la langue de l'application
 *
 * Source de vérité pour la locale courante.
 * Utilisé par:
 * - LocaleInterceptor pour ajouter Accept-Language aux requêtes
 * - TranslateService pour charger les traductions
 * - Composants pour afficher le sélecteur de langue
 */
@Injectable({
  providedIn: 'root',
})
export class LocaleService {
  private readonly translate = inject(TranslateService);
  private readonly storage = inject(StorageService);
  private readonly currentLocale$ = new BehaviorSubject<Locale>(DEFAULT_LOCALE);

  constructor() {
    this.initLocale();
  }

  /**
   * Observable pour les composants qui veulent réagir aux changements de langue
   */
  getLocale$(): Observable<Locale> {
    return this.currentLocale$.asObservable();
  }

  /**
   * Getter synchrone pour les interceptors
   */
  getCurrentLocale(): Locale {
    return this.currentLocale$.getValue();
  }

  /**
   * Change la langue de l'application
   */
  setLocale(locale: Locale): void {
    this.currentLocale$.next(locale);
    this.translate.use(locale);
    this.storage.set(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }

  /**
   * Tente de changer la langue, retourne false si non supportée
   */
  trySetLocale(locale: string): boolean {
    if (!this.isSupported(locale)) {
      console.warn(`LocaleService: Locale "${locale}" not supported`);
      return false;
    }
    this.setLocale(locale);
    return true;
  }

  /**
   * Retourne les locales supportées
   */
  getSupportedLocales(): readonly Locale[] {
    return SUPPORTED_LOCALES;
  }

  /**
   * Vérifie si une locale est supportée
   */
  isSupported(locale: string): locale is Locale {
    return SUPPORTED_LOCALES.includes(locale as Locale);
  }

  /**
   * Initialise la locale au démarrage
   * Priorité: localStorage > navigator.language > défaut
   * Note: Ne PAS appeler translate.use() ici - c'est géré par APP_INITIALIZER
   */
  private initLocale(): void {
    // 1. Essayer depuis le storage
    const stored = this.storage.get(STORAGE_KEY);
    if (stored !== null && this.isSupported(stored)) {
      this.currentLocale$.next(stored);
      document.documentElement.lang = stored;
      return;
    }

    // 2. Essayer depuis le navigateur
    const browserLang = navigator.language.slice(0, 2);
    if (this.isSupported(browserLang)) {
      this.currentLocale$.next(browserLang);
      document.documentElement.lang = browserLang;
      return;
    }

    // 3. Défaut
    this.currentLocale$.next(DEFAULT_LOCALE);
    document.documentElement.lang = DEFAULT_LOCALE;
  }
}
