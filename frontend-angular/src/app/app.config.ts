import {
  ApplicationConfig,
  APP_INITIALIZER,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  provideTranslateService,
  TranslateService,
  TranslateLoader,
} from '@ngx-translate/core';
import {
  TranslateHttpLoader,
  TRANSLATE_HTTP_LOADER_CONFIG,
} from '@ngx-translate/http-loader';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { localeInterceptor, datasetInterceptor } from './core/interceptors';
import { LocaleService } from './core/services/locale.service';

/**
 * Factory pour initialiser les traductions au démarrage
 * Utilise LocaleService pour charger la langue sauvegardée
 */
function initializeTranslations(
  translate: TranslateService,
  localeService: LocaleService
): () => Promise<void> {
  return async () => {
    translate.addLangs(['fr', 'en']);
    translate.setDefaultLang('fr');
    // Charge la langue depuis LocaleService (qui lit localStorage)
    const savedLocale = localeService.getCurrentLocale();
    await firstValueFrom(translate.use(savedLocale));
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),

    // HttpClient avec interceptors
    // ORDRE IMPORTANT: les interceptors sont exécutés dans l'ordre
    provideHttpClient(
      withInterceptors([
        localeInterceptor,    // 1. Ajoute Accept-Language
        datasetInterceptor,   // 2. Ajoute dataset_id
      ])
    ),

    // Configuration du HTTP loader pour les traductions
    {
      provide: TRANSLATE_HTTP_LOADER_CONFIG,
      useValue: {
        prefix: '/assets/i18n/',
        suffix: '.json',
      },
    },

    // ngx-translate pour i18n avec HTTP loader
    provideTranslateService({
      defaultLanguage: 'fr',
      loader: {
        provide: TranslateLoader,
        useClass: TranslateHttpLoader,
      },
    }),

    // APP_INITIALIZER pour charger les traductions AVANT le rendu
    {
      provide: APP_INITIALIZER,
      useFactory: initializeTranslations,
      deps: [TranslateService, LocaleService],
      multi: true,
    },
  ],
};
