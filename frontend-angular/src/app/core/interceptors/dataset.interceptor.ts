import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { DatasetService } from '../services/dataset.service';

/**
 * Endpoints qui ne nécessitent pas de dataset_id
 */
const EXCLUDED_ENDPOINTS = [
  '/datasets',
  '/settings',
  '/health',
  '/api/health',
];

/**
 * Vérifie si l'URL doit être exclue de l'injection de dataset_id
 */
function shouldExclude(url: string): boolean {
  return EXCLUDED_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

/**
 * DatasetInterceptor - Ajoute le dataset_id aux requêtes API
 *
 * Functional interceptor (nouvelle API Angular 15+)
 * Injecte automatiquement le dataset_id dans les query params
 * pour toutes les requêtes sauf celles vers les endpoints exclus.
 */
export const datasetInterceptor: HttpInterceptorFn = (req, next) => {
  const datasetService = inject(DatasetService);
  const activeDatasetId = datasetService.getActiveDatasetId();

  // Si pas de dataset actif ou endpoint exclu, passer la requête telle quelle
  if (activeDatasetId === null || shouldExclude(req.url)) {
    return next(req);
  }

  // Clone la requête avec le dataset_id en query param
  const modifiedRequest = req.clone({
    setParams: {
      dataset_id: activeDatasetId,
    },
  });

  return next(modifiedRequest);
};
