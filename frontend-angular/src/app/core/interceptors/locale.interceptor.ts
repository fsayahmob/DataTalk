import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { LocaleService } from '../services/locale.service';

/**
 * LocaleInterceptor - Ajoute le header Accept-Language à toutes les requêtes
 *
 * Functional interceptor (nouvelle API Angular 15+)
 * Le backend utilise ce header pour retourner les messages dans la bonne langue.
 */
export const localeInterceptor: HttpInterceptorFn = (req, next) => {
  const localeService = inject(LocaleService);
  const locale = localeService.getCurrentLocale();

  const modifiedRequest = req.clone({
    setHeaders: {
      'Accept-Language': locale,
    },
  });

  return next(modifiedRequest);
};
