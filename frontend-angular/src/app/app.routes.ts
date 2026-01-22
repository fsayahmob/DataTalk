import { Routes } from '@angular/router';
import { AppShellComponent } from './layout';

export const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/analytics/analytics.component').then(
            (m) => m.AnalyticsComponent
          ),
      },
      {
        path: 'datasets',
        loadComponent: () =>
          import('./features/datasets/datasets.component').then(
            (m) => m.DatasetsComponent
          ),
      },
      {
        path: 'catalog',
        loadComponent: () =>
          import('./features/catalog/catalog.component').then(
            (m) => m.CatalogComponent
          ),
      },
      {
        path: 'runs',
        loadComponent: () =>
          import('./features/runs/runs.component').then((m) => m.RunsComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then(
            (m) => m.SettingsComponent
          ),
      },
      // Wildcard: redirect unknown routes to home
      {
        path: '**',
        redirectTo: '',
      },
    ],
  },
];
