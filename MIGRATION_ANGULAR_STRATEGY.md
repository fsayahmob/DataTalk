# Stratégie de Migration Angular - G7 Analytics

> **Document de référence technique**
> **Version** : 1.0
> **Date** : 2026-01-18
> **Statut** : Approuvé pour exécution

---

## 1. Executive Summary

### 1.1 Contexte

Le frontend actuel (React/Next.js) souffre d'un problème architectural fondamental : **l'absence de contraintes structurelles** permet l'introduction de code non conforme aux patterns établis, particulièrement lors de l'utilisation d'assistants IA pour le développement.

### 1.2 Décision

Migration vers **Angular** - un framework opinionated qui **force** les patterns par design, rendant impossible le "cowboy coding".

### 1.3 Bénéfices attendus

| Métrique | Avant (React) | Après (Angular) |
|----------|---------------|-----------------|
| Conformité pattern | ~60% (variable) | 100% (forcé par framework) |
| Temps de review code | Élevé (vérification manuelle) | Réduit (framework valide) |
| Onboarding nouveau dev/IA | Difficile (patterns custom) | Standard (patterns Angular) |
| Maintenance long terme | Risquée | Prévisible |

---

## 2. Analyse Technique

### 2.1 Problèmes du stack actuel

```
┌─────────────────────────────────────────────────────────────────┐
│                    REACT/NEXT.JS - PROBLÈMES                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. LIBERTÉ EXCESSIVE                                           │
│     └── fetch() peut être appelé n'importe où                   │
│     └── useState() utilisé pour état global                     │
│     └── CSS inline, modules, Tailwind mélangés                  │
│                                                                 │
│  2. PATTERNS NON ENFORCED                                       │
│     └── ESLint contournable                                     │
│     └── Documentation ignorée                                   │
│     └── Hooks wrappers vs stores vs direct                      │
│                                                                 │
│  3. IA NON CONTRAINTE                                           │
│     └── Génère du code isolé, pas intégré                       │
│     └── Ne vérifie pas les patterns existants                   │
│     └── Crée des doublons                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Pourquoi Angular résout ces problèmes

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANGULAR - SOLUTIONS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. DEPENDENCY INJECTION OBLIGATOIRE                            │
│     └── Services injectés, pas importés librement               │
│     └── Impossible d'appeler une API sans service               │
│     └── Le compilateur refuse le code non conforme              │
│                                                                 │
│  2. STRUCTURE IMPOSÉE                                           │
│     └── Modules, Components, Services, Pipes                    │
│     └── Chaque élément a sa place définie                       │
│     └── ng generate crée la structure correcte                  │
│                                                                 │
│  3. HTTPCLIENT + INTERCEPTORS                                   │
│     └── Seul moyen d'appeler le backend                         │
│     └── Interceptors injectent dataset_id + locale              │
│     └── Impossible de bypass                                    │
│                                                                 │
│  4. TYPESCRIPT STRICT PAR DÉFAUT                                │
│     └── Types obligatoires                                      │
│     └── Null checks forcés                                      │
│     └── Compilation échoue si non conforme                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Architecture Cible

### 3.1 Structure du projet Angular

```
frontend-angular/
├── src/
│   ├── app/
│   │   ├── core/                      # Singleton services, guards, interceptors
│   │   │   ├── interceptors/
│   │   │   │   ├── auth.interceptor.ts
│   │   │   │   ├── dataset.interceptor.ts      # Injecte dataset_id
│   │   │   │   └── locale.interceptor.ts       # Injecte Accept-Language
│   │   │   ├── services/
│   │   │   │   ├── dataset.service.ts          # Gestion dataset actif
│   │   │   │   ├── locale.service.ts           # Gestion langue
│   │   │   │   └── storage.service.ts          # LocalStorage wrapper
│   │   │   ├── guards/
│   │   │   │   └── dataset.guard.ts            # Bloque si pas de dataset
│   │   │   └── core.module.ts
│   │   │
│   │   ├── shared/                    # Composants réutilisables
│   │   │   ├── components/
│   │   │   │   ├── button/
│   │   │   │   ├── card/
│   │   │   │   ├── modal/
│   │   │   │   └── toast/
│   │   │   ├── pipes/
│   │   │   │   └── translate.pipe.ts
│   │   │   ├── directives/
│   │   │   └── shared.module.ts
│   │   │
│   │   ├── features/                  # Feature modules (lazy loaded)
│   │   │   ├── datasets/
│   │   │   │   ├── components/
│   │   │   │   │   ├── dataset-list/
│   │   │   │   │   ├── dataset-detail/
│   │   │   │   │   └── dataset-header/
│   │   │   │   ├── services/
│   │   │   │   │   └── datasets-api.service.ts
│   │   │   │   ├── datasets-routing.module.ts
│   │   │   │   └── datasets.module.ts
│   │   │   │
│   │   │   ├── catalog/
│   │   │   │   ├── components/
│   │   │   │   │   ├── catalog-view/
│   │   │   │   │   ├── table-detail/
│   │   │   │   │   └── schema-node/
│   │   │   │   ├── services/
│   │   │   │   │   └── catalog-api.service.ts
│   │   │   │   ├── catalog-routing.module.ts
│   │   │   │   └── catalog.module.ts
│   │   │   │
│   │   │   ├── chat/
│   │   │   │   ├── components/
│   │   │   │   │   ├── chat-panel/
│   │   │   │   │   ├── message-list/
│   │   │   │   │   └── query-input/
│   │   │   │   ├── services/
│   │   │   │   │   ├── conversation-api.service.ts
│   │   │   │   │   └── conversation-state.service.ts
│   │   │   │   ├── chat-routing.module.ts
│   │   │   │   └── chat.module.ts
│   │   │   │
│   │   │   ├── settings/
│   │   │   │   ├── components/
│   │   │   │   ├── services/
│   │   │   │   └── settings.module.ts
│   │   │   │
│   │   │   └── runs/
│   │   │       ├── components/
│   │   │       ├── services/
│   │   │       └── runs.module.ts
│   │   │
│   │   ├── layout/                    # Layout components
│   │   │   ├── sidebar/
│   │   │   ├── header/
│   │   │   └── layout.module.ts
│   │   │
│   │   ├── app-routing.module.ts
│   │   ├── app.component.ts
│   │   └── app.module.ts
│   │
│   ├── assets/
│   │   ├── i18n/
│   │   │   ├── fr.json
│   │   │   └── en.json
│   │   └── images/
│   │
│   ├── environments/
│   │   ├── environment.ts
│   │   └── environment.prod.ts
│   │
│   └── styles/
│       ├── _variables.scss
│       ├── _themes.scss
│       └── styles.scss
│
├── angular.json
├── package.json
├── tsconfig.json
└── CLAUDE.md                          # Instructions pour IA
```

### 3.2 Diagramme de flux des requêtes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ANGULAR APPLICATION                            │
│                                                                         │
│  ┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐      │
│  │  Component  │────▶│  Feature Service │────▶│   HttpClient     │      │
│  │             │     │  (API calls)     │     │                  │      │
│  └─────────────┘     └─────────────────┘     └────────┬─────────┘      │
│                                                        │                │
│                                                        ▼                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      INTERCEPTOR CHAIN                           │   │
│  │                                                                  │   │
│  │  ┌──────────────────┐    ┌──────────────────┐    ┌───────────┐  │   │
│  │  │ DatasetInterceptor│───▶│ LocaleInterceptor │───▶│  Auth...  │  │   │
│  │  │                  │    │                  │    │           │  │   │
│  │  │ + dataset_id     │    │ + Accept-Language│    │ + token   │  │   │
│  │  └──────────────────┘    └──────────────────┘    └───────────┘  │   │
│  │                                                                  │   │
│  └──────────────────────────────────┬───────────────────────────────┘   │
│                                     │                                   │
└─────────────────────────────────────┼───────────────────────────────────┘
                                      │
                                      ▼
                        GET /api/catalog?dataset_id=xxx
                        Headers:
                          Accept-Language: fr
                          Authorization: Bearer xxx
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           FASTAPI BACKEND                                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         MIDDLEWARE                               │   │
│  │  get_locale() ◀── Accept-Language                               │   │
│  │  get_dataset() ◀── dataset_id query param                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                     │                                   │
│                                     ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      ROUTE HANDLER                               │   │
│  │  async def get_catalog(dataset_id: str, locale: str):           │   │
│  │      # Utilise le bon dataset                                    │   │
│  │      # Répond dans la bonne langue                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Spécifications Techniques Détaillées

### 4.1 Core Module - Interceptors

#### 4.1.1 Dataset Interceptor

```typescript
// src/app/core/interceptors/dataset.interceptor.ts

import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { DatasetService } from '../services/dataset.service';

@Injectable()
export class DatasetInterceptor implements HttpInterceptor {
  constructor(private datasetService: DatasetService) {}

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const activeDataset = this.datasetService.getActiveDataset();

    if (activeDataset && this.shouldIncludeDataset(request.url)) {
      // Clone la requête avec le dataset_id
      const modifiedRequest = request.clone({
        setParams: {
          dataset_id: activeDataset.id,
        },
      });
      return next.handle(modifiedRequest);
    }

    return next.handle(request);
  }

  private shouldIncludeDataset(url: string): boolean {
    // Endpoints qui ne nécessitent pas de dataset_id
    const excludedEndpoints = ['/datasets', '/settings', '/health'];
    return !excludedEndpoints.some((endpoint) => url.includes(endpoint));
  }
}
```

#### 4.1.2 Locale Interceptor

```typescript
// src/app/core/interceptors/locale.interceptor.ts

import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { LocaleService } from '../services/locale.service';

@Injectable()
export class LocaleInterceptor implements HttpInterceptor {
  constructor(private localeService: LocaleService) {}

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const locale = this.localeService.getCurrentLocale();

    const modifiedRequest = request.clone({
      setHeaders: {
        'Accept-Language': locale,
      },
    });

    return next.handle(modifiedRequest);
  }
}
```

#### 4.1.3 Registration des Interceptors

```typescript
// src/app/core/core.module.ts

import { NgModule, Optional, SkipSelf } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HTTP_INTERCEPTORS } from '@angular/common/http';

import { DatasetInterceptor } from './interceptors/dataset.interceptor';
import { LocaleInterceptor } from './interceptors/locale.interceptor';

import { DatasetService } from './services/dataset.service';
import { LocaleService } from './services/locale.service';
import { StorageService } from './services/storage.service';

@NgModule({
  imports: [CommonModule],
  providers: [
    // Services
    DatasetService,
    LocaleService,
    StorageService,

    // Interceptors - ORDRE IMPORTANT
    {
      provide: HTTP_INTERCEPTORS,
      useClass: DatasetInterceptor,
      multi: true,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: LocaleInterceptor,
      multi: true,
    },
  ],
})
export class CoreModule {
  // Empêche l'import multiple du CoreModule
  constructor(@Optional() @SkipSelf() parentModule: CoreModule) {
    if (parentModule) {
      throw new Error(
        'CoreModule is already loaded. Import it only in AppModule.'
      );
    }
  }
}
```

### 4.2 Services Centraux

#### 4.2.1 Dataset Service

```typescript
// src/app/core/services/dataset.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { StorageService } from './storage.service';

export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  status: 'empty' | 'syncing' | 'ready' | 'error';
  isActive: boolean;
  rowCount: number;
  tableCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'active_dataset_id';

@Injectable({
  providedIn: 'root',
})
export class DatasetService {
  private activeDataset$ = new BehaviorSubject<Dataset | null>(null);
  private datasets$ = new BehaviorSubject<Dataset[]>([]);

  constructor(private storage: StorageService) {
    this.loadFromStorage();
  }

  // Getters observables pour les composants
  getActiveDataset$(): Observable<Dataset | null> {
    return this.activeDataset$.asObservable();
  }

  getDatasets$(): Observable<Dataset[]> {
    return this.datasets$.asObservable();
  }

  // Getter synchrone pour les interceptors
  getActiveDataset(): Dataset | null {
    return this.activeDataset$.getValue();
  }

  // Actions
  setActiveDataset(dataset: Dataset): void {
    this.activeDataset$.next(dataset);
    this.storage.set(STORAGE_KEY, dataset.id);
  }

  setDatasets(datasets: Dataset[]): void {
    this.datasets$.next(datasets);

    // Si un dataset était actif, le mettre à jour avec les nouvelles données
    const activeId = this.storage.get(STORAGE_KEY);
    if (activeId) {
      const active = datasets.find((d) => d.id === activeId);
      if (active) {
        this.activeDataset$.next(active);
      }
    }
  }

  clearActiveDataset(): void {
    this.activeDataset$.next(null);
    this.storage.remove(STORAGE_KEY);
  }

  private loadFromStorage(): void {
    const activeId = this.storage.get(STORAGE_KEY);
    // Le dataset sera chargé quand setDatasets sera appelé
  }
}
```

#### 4.2.2 Locale Service

```typescript
// src/app/core/services/locale.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { StorageService } from './storage.service';

export type Locale = 'fr' | 'en';

const STORAGE_KEY = 'locale';
const DEFAULT_LOCALE: Locale = 'fr';
const SUPPORTED_LOCALES: Locale[] = ['fr', 'en'];

@Injectable({
  providedIn: 'root',
})
export class LocaleService {
  private currentLocale$ = new BehaviorSubject<Locale>(DEFAULT_LOCALE);

  constructor(
    private translate: TranslateService,
    private storage: StorageService
  ) {
    this.initLocale();
  }

  // Observable pour les composants
  getLocale$(): Observable<Locale> {
    return this.currentLocale$.asObservable();
  }

  // Getter synchrone pour les interceptors
  getCurrentLocale(): Locale {
    return this.currentLocale$.getValue();
  }

  // Changer la langue
  setLocale(locale: Locale): void {
    if (!SUPPORTED_LOCALES.includes(locale)) {
      console.warn(`Locale ${locale} not supported`);
      return;
    }

    this.currentLocale$.next(locale);
    this.translate.use(locale);
    this.storage.set(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }

  private initLocale(): void {
    // 1. Essayer depuis le storage
    const stored = this.storage.get(STORAGE_KEY) as Locale;
    if (stored && SUPPORTED_LOCALES.includes(stored)) {
      this.setLocale(stored);
      return;
    }

    // 2. Essayer depuis le navigateur
    const browserLang = navigator.language.slice(0, 2) as Locale;
    if (SUPPORTED_LOCALES.includes(browserLang)) {
      this.setLocale(browserLang);
      return;
    }

    // 3. Défaut
    this.setLocale(DEFAULT_LOCALE);
  }
}
```

### 4.3 Configuration i18n (ngx-translate)

```typescript
// src/app/app.module.ts

import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { CoreModule } from './core/core.module';

// Factory pour charger les fichiers de traduction
export function HttpLoaderFactory(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    CoreModule,
    TranslateModule.forRoot({
      defaultLanguage: 'fr',
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient],
      },
    }),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

### 4.4 Exemple de Feature Module (Datasets)

```typescript
// src/app/features/datasets/services/datasets-api.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { Dataset } from '../../../core/services/dataset.service';

interface DatasetsResponse {
  datasets: Dataset[];
  count: number;
  active_dataset_id: string | null;
}

interface DatasetResponse {
  dataset: Dataset;
}

@Injectable()
export class DatasetsApiService {
  private readonly baseUrl = `${environment.apiUrl}/datasets`;

  constructor(private http: HttpClient) {}

  // NOTE: dataset_id n'est PAS passé ici - l'interceptor s'en charge

  getAll(includeStats = true): Observable<Dataset[]> {
    return this.http
      .get<DatasetsResponse>(this.baseUrl, {
        params: { include_stats: includeStats.toString() },
      })
      .pipe(map((response) => response.datasets));
  }

  getById(id: string): Observable<Dataset> {
    return this.http.get<Dataset>(`${this.baseUrl}/${id}`);
  }

  create(name: string, description?: string): Observable<Dataset> {
    return this.http.post<Dataset>(this.baseUrl, { name, description });
  }

  update(id: string, data: Partial<Dataset>): Observable<Dataset> {
    return this.http.patch<Dataset>(`${this.baseUrl}/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  activate(id: string): Observable<DatasetResponse> {
    return this.http.post<DatasetResponse>(`${this.baseUrl}/${id}/activate`, {});
  }

  refreshStats(id: string): Observable<Dataset> {
    return this.http.post<Dataset>(`${this.baseUrl}/${id}/refresh-stats`, {});
  }
}
```

```typescript
// src/app/features/datasets/components/dataset-list/dataset-list.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Dataset, DatasetService } from '../../../../core/services/dataset.service';
import { DatasetsApiService } from '../../services/datasets-api.service';

@Component({
  selector: 'app-dataset-list',
  templateUrl: './dataset-list.component.html',
  styleUrls: ['./dataset-list.component.scss'],
})
export class DatasetListComponent implements OnInit, OnDestroy {
  datasets: Dataset[] = [];
  activeDataset: Dataset | null = null;
  loading = true;
  error: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private datasetsApi: DatasetsApiService,
    private datasetService: DatasetService
  ) {}

  ngOnInit(): void {
    this.loadDatasets();

    // Écouter les changements de dataset actif
    this.datasetService
      .getActiveDataset$()
      .pipe(takeUntil(this.destroy$))
      .subscribe((dataset) => {
        this.activeDataset = dataset;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDatasets(): void {
    this.loading = true;
    this.error = null;

    this.datasetsApi.getAll().subscribe({
      next: (datasets) => {
        this.datasets = datasets;
        this.datasetService.setDatasets(datasets);
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load datasets';
        this.loading = false;
      },
    });
  }

  activateDataset(dataset: Dataset): void {
    this.datasetsApi.activate(dataset.id).subscribe({
      next: (response) => {
        this.datasetService.setActiveDataset(response.dataset);
      },
      error: (err) => {
        console.error('Failed to activate dataset', err);
      },
    });
  }

  deleteDataset(dataset: Dataset): void {
    if (!confirm(`Delete dataset "${dataset.name}"?`)) {
      return;
    }

    this.datasetsApi.delete(dataset.id).subscribe({
      next: () => {
        this.loadDatasets();
        if (this.activeDataset?.id === dataset.id) {
          this.datasetService.clearActiveDataset();
        }
      },
      error: (err) => {
        console.error('Failed to delete dataset', err);
      },
    });
  }
}
```

---

## 5. Plan de Migration Détaillé

### 5.1 Phase 0 : Préparation (1 jour)

#### Objectifs
- Setup du projet Angular
- Configuration de base
- Validation que le build fonctionne

#### Tâches

| ID | Tâche | Commande/Action | Critère de succès |
|----|-------|-----------------|-------------------|
| 0.1 | Installer Angular CLI | `npm install -g @angular/cli` | `ng version` fonctionne |
| 0.2 | Créer projet | `ng new frontend-angular --strict --routing --style=scss` | Projet créé |
| 0.3 | Configurer environment | Créer `environment.ts` avec `apiUrl` | Build OK |
| 0.4 | Installer dépendances | `npm i @ngx-translate/core @ngx-translate/http-loader` | Package.json mis à jour |
| 0.5 | Copier assets i18n | Copier `fr.json` et `en.json` | Fichiers présents |
| 0.6 | Test de fumée | `ng serve` | App démarre sur localhost:4200 |

#### Livrables
- [ ] Projet Angular fonctionnel
- [ ] Configuration TypeScript strict
- [ ] Fichiers i18n copiés

---

### 5.2 Phase 1 : Core Module (2 jours)

#### Objectifs
- Implémenter les services centraux
- Configurer les interceptors
- Valider la propagation dataset_id + locale

#### Tâches

| ID | Tâche | Fichiers | Critère de succès |
|----|-------|----------|-------------------|
| 1.1 | Créer CoreModule | `core/core.module.ts` | Module importé dans AppModule |
| 1.2 | StorageService | `core/services/storage.service.ts` | LocalStorage wrappé |
| 1.3 | LocaleService | `core/services/locale.service.ts` | Langue persistée |
| 1.4 | DatasetService | `core/services/dataset.service.ts` | Dataset actif géré |
| 1.5 | LocaleInterceptor | `core/interceptors/locale.interceptor.ts` | Header ajouté |
| 1.6 | DatasetInterceptor | `core/interceptors/dataset.interceptor.ts` | Query param ajouté |
| 1.7 | Configurer ngx-translate | `app.module.ts` | Traductions chargées |
| 1.8 | Test intégration | Appel API avec DevTools | Headers + params visibles |

#### Tests de validation

```bash
# Démarrer le backend
cd backend && uvicorn main:app --reload

# Démarrer Angular
cd frontend-angular && ng serve

# Vérifier dans DevTools > Network :
# - Requêtes ont "Accept-Language: fr"
# - Requêtes ont "?dataset_id=xxx" (si dataset actif)
```

#### Livrables
- [ ] CoreModule complet
- [ ] Interceptors fonctionnels
- [ ] Tests manuels passés

---

### 5.3 Phase 2 : Shared Module (1 jour)

#### Objectifs
- Créer les composants UI réutilisables
- Configurer les styles globaux

#### Tâches

| ID | Tâche | Fichiers |
|----|-------|----------|
| 2.1 | SharedModule | `shared/shared.module.ts` |
| 2.2 | Button component | `shared/components/button/` |
| 2.3 | Card component | `shared/components/card/` |
| 2.4 | Modal component | `shared/components/modal/` |
| 2.5 | Toast component | `shared/components/toast/` |
| 2.6 | Spinner component | `shared/components/spinner/` |
| 2.7 | Variables SCSS | `styles/_variables.scss` |
| 2.8 | Themes SCSS | `styles/_themes.scss` |

#### Livrables
- [ ] SharedModule avec composants de base
- [ ] Styles globaux configurés

---

### 5.4 Phase 3 : Layout Module (1 jour)

#### Objectifs
- Implémenter la structure de l'application
- Sidebar, Header, routing de base

#### Tâches

| ID | Tâche | Fichiers |
|----|-------|----------|
| 3.1 | LayoutModule | `layout/layout.module.ts` |
| 3.2 | Sidebar component | `layout/sidebar/` |
| 3.3 | Header component | `layout/header/` |
| 3.4 | Main layout | `layout/main-layout/` |
| 3.5 | Language selector | `layout/language-selector/` |
| 3.6 | Dataset header | Intégration header datasets |
| 3.7 | Routing de base | `app-routing.module.ts` |

#### Livrables
- [ ] Layout fonctionnel
- [ ] Navigation entre pages
- [ ] Sélecteur de langue fonctionnel

---

### 5.5 Phase 4 : Feature Modules (5 jours)

#### 5.5.1 Datasets Module (1 jour)

| ID | Tâche |
|----|-------|
| 4.1.1 | DatasetsModule + routing |
| 4.1.2 | DatasetsApiService |
| 4.1.3 | DatasetListComponent |
| 4.1.4 | DatasetDetailComponent |
| 4.1.5 | CreateDatasetModal |

#### 5.5.2 Settings Module (0.5 jour)

| ID | Tâche |
|----|-------|
| 4.2.1 | SettingsModule + routing |
| 4.2.2 | SettingsApiService |
| 4.2.3 | SettingsPageComponent |
| 4.2.4 | API Keys tab |
| 4.2.5 | Appearance tab |

#### 5.5.3 Catalog Module (1.5 jours)

| ID | Tâche |
|----|-------|
| 4.3.1 | CatalogModule + routing |
| 4.3.2 | CatalogApiService |
| 4.3.3 | CatalogViewComponent |
| 4.3.4 | SchemaNodeComponent |
| 4.3.5 | TableDetailPanel |
| 4.3.6 | Intégration ReactFlow ou équivalent Angular |

#### 5.5.4 Chat Module (1.5 jours)

| ID | Tâche |
|----|-------|
| 4.4.1 | ChatModule + routing |
| 4.4.2 | ConversationApiService |
| 4.4.3 | ChatPanelComponent |
| 4.4.4 | MessageListComponent |
| 4.4.5 | QueryInputComponent |
| 4.4.6 | ResultsDisplayComponent |
| 4.4.7 | ChartComponent |

#### 5.5.5 Runs Module (0.5 jour)

| ID | Tâche |
|----|-------|
| 4.5.1 | RunsModule + routing |
| 4.5.2 | RunsApiService |
| 4.5.3 | RunsListComponent |
| 4.5.4 | RunDetailComponent |

#### Livrables Phase 4
- [ ] Tous les feature modules implémentés
- [ ] Fonctionnalités équivalentes au React actuel
- [ ] Tests manuels de chaque feature

---

### 5.6 Phase 5 : Tests & QA (2 jours)

#### Objectifs
- Tests unitaires pour les services
- Tests e2e pour les parcours critiques
- Fix des bugs découverts

#### Tâches

| ID | Tâche |
|----|-------|
| 5.1 | Tests unitaires CoreModule |
| 5.2 | Tests unitaires services API |
| 5.3 | Tests e2e : création dataset |
| 5.4 | Tests e2e : changement langue |
| 5.5 | Tests e2e : requête Text-to-SQL |
| 5.6 | Fix bugs identifiés |
| 5.7 | Test de performance |

#### Couverture cible
- Services : 80%+
- Components critiques : 70%+

---

### 5.7 Phase 6 : Déploiement (1 jour)

#### Objectifs
- Build de production
- Mise à jour Docker
- Switch final

#### Tâches

| ID | Tâche |
|----|-------|
| 6.1 | Build production | `ng build --configuration production` |
| 6.2 | Mettre à jour Dockerfile |
| 6.3 | Mettre à jour docker-compose.yml |
| 6.4 | Test en environnement Docker |
| 6.5 | Renommer `frontend/` en `frontend-react-archive/` |
| 6.6 | Renommer `frontend-angular/` en `frontend/` |
| 6.7 | Test final complet |
| 6.8 | Commit & push |

---

## 6. Estimation Totale

| Phase | Durée | Cumulé |
|-------|-------|--------|
| Phase 0 : Préparation | 1 jour | 1 jour |
| Phase 1 : Core Module | 2 jours | 3 jours |
| Phase 2 : Shared Module | 1 jour | 4 jours |
| Phase 3 : Layout Module | 1 jour | 5 jours |
| Phase 4 : Feature Modules | 5 jours | 10 jours |
| Phase 5 : Tests & QA | 2 jours | 12 jours |
| Phase 6 : Déploiement | 1 jour | 13 jours |

**Total : 13 jours de développement**

---

## 7. Gestion des Risques

### 7.1 Risques identifiés

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Courbe d'apprentissage Angular | Moyenne | Moyen | Documentation, exemples de code |
| Librairie ReactFlow non disponible en Angular | Haute | Moyen | Utiliser ngx-graph ou alternative |
| Régression fonctionnelle | Moyenne | Élevé | Tests e2e, comparaison avec React |
| Performance dégradée | Faible | Moyen | Lazy loading, OnPush strategy |
| Délais dépassés | Moyenne | Moyen | Buffer de 2 jours dans planning |

### 7.2 Plan de rollback

Si la migration échoue à n'importe quelle phase :

1. Le frontend React reste intact (`frontend/`)
2. Supprimer `frontend-angular/`
3. Analyser les problèmes rencontrés
4. Décider : réessayer ou rester sur React

---

## 8. Critères de Succès

### 8.1 Fonctionnels

- [ ] Toutes les features du React sont disponibles en Angular
- [ ] Changement de langue met à jour toute l'UI
- [ ] Changement de dataset met à jour toutes les données
- [ ] Les requêtes API contiennent `dataset_id` et `Accept-Language`

### 8.2 Techniques

- [ ] Build production < 500KB (gzipped)
- [ ] Lighthouse performance > 80
- [ ] Couverture tests > 70%
- [ ] Zero erreur TypeScript en strict mode

### 8.3 Process

- [ ] L'IA génère du code conforme au pattern Angular
- [ ] Impossible de bypass les interceptors
- [ ] Nouveau dev opérationnel en < 2h

---

## 9. Instructions pour l'IA (CLAUDE.md)

À inclure dans `frontend-angular/CLAUDE.md` :

```markdown
# Instructions Angular - G7 Analytics

## RÈGLES ABSOLUES

1. **JAMAIS** utiliser `fetch()` directement → utiliser `HttpClient`
2. **JAMAIS** créer un nouveau service sans l'enregistrer dans un module
3. **JAMAIS** mettre de logique métier dans les composants → services
4. **TOUJOURS** utiliser `TranslateService` pour les textes
5. **TOUJOURS** typer strictement (pas de `any`)

## AVANT DE CRÉER UN COMPOSANT

1. Vérifier s'il existe dans `shared/components/`
2. Utiliser `ng generate component` (pas à la main)
3. L'ajouter au bon module

## AVANT DE CRÉER UN SERVICE

1. Vérifier s'il existe dans `core/services/` ou `features/*/services/`
2. Utiliser `ng generate service`
3. L'injecter via le constructeur

## STRUCTURE D'UN COMPOSANT

\`\`\`typescript
@Component({
  selector: 'app-example',
  templateUrl: './example.component.html',
  styleUrls: ['./example.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush, // TOUJOURS
})
export class ExampleComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(
    private myService: MyService, // Injection
    private translate: TranslateService, // i18n
  ) {}

  ngOnInit(): void {
    // Subscriptions avec takeUntil
    this.myService.getData$()
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
\`\`\`

## TRADUCTIONS

\`\`\`html
<!-- Dans les templates -->
<h1>{{ 'catalog.title' | translate }}</h1>

<!-- Avec paramètres -->
<p>{{ 'common.items_count' | translate:{ count: items.length } }}</p>
\`\`\`

## API CALLS

\`\`\`typescript
// TOUJOURS dans un service, JAMAIS dans un composant
@Injectable()
export class CatalogApiService {
  constructor(private http: HttpClient) {}

  // dataset_id et locale sont ajoutés automatiquement par les interceptors
  getCatalog(): Observable<Catalog> {
    return this.http.get<Catalog>('/api/catalog');
  }
}
\`\`\`
```

---

## 10. Linters d'Architecture (Anti-Dette Technique)

### 10.1 Stack de Linting

```
┌─────────────────────────────────────────────────────────────────┐
│                    PIPELINE DE VALIDATION                        │
│                                                                 │
│  Code modifié                                                   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐   │
│  │ ESLint      │──▶│ Boundaries  │──▶│ Dependency Cruiser  │   │
│  │ TypeScript  │   │ Modules     │   │ Architecture        │   │
│  └─────────────┘   └─────────────┘   └─────────────────────┘   │
│       │                                     │                   │
│       ▼                                     ▼                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    HUSKY PRE-COMMIT                      │   │
│  │  Si erreur → Commit BLOQUÉ                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Installation

```bash
# ESLint Angular (déjà inclus)
ng add @angular-eslint/schematics

# Boundaries - Empêche imports interdits entre modules
npm install eslint-plugin-boundaries --save-dev

# Dependency Cruiser - Valide l'architecture
npm install dependency-cruiser --save-dev

# Husky + Lint-staged - Pre-commit hooks
npm install husky lint-staged --save-dev
npx husky init
```

### 10.3 Configuration ESLint Stricte

```javascript
// .eslintrc.json
{
  "root": true,
  "ignorePatterns": ["projects/**/*"],
  "plugins": ["boundaries", "@typescript-eslint"],
  "overrides": [
    {
      "files": ["*.ts"],
      "parserOptions": {
        "project": ["tsconfig.json"]
      },
      "extends": [
        "eslint:recommended",
        "plugin:@typescript-eslint/strict-type-checked",
        "plugin:@angular-eslint/recommended",
        "plugin:@angular-eslint/template/process-inline-templates",
        "plugin:boundaries/recommended"
      ],
      "settings": {
        "boundaries/elements": [
          { "type": "core", "pattern": "src/app/core/*" },
          { "type": "shared", "pattern": "src/app/shared/*" },
          { "type": "features", "pattern": "src/app/features/*" },
          { "type": "layout", "pattern": "src/app/layout/*" }
        ]
      },
      "rules": {
        // ═══════════════════════════════════════════════════════════
        // RÈGLES TYPESCRIPT STRICTES
        // ═══════════════════════════════════════════════════════════
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/explicit-function-return-type": "error",
        "@typescript-eslint/no-unused-vars": "error",
        "@typescript-eslint/strict-boolean-expressions": "error",

        // ═══════════════════════════════════════════════════════════
        // RÈGLES ANGULAR
        // ═══════════════════════════════════════════════════════════
        "@angular-eslint/component-class-suffix": "error",
        "@angular-eslint/directive-class-suffix": "error",
        "@angular-eslint/no-input-rename": "error",
        "@angular-eslint/no-output-rename": "error",
        "@angular-eslint/use-lifecycle-interface": "error",
        "@angular-eslint/prefer-on-push-component-change-detection": "error",

        // ═══════════════════════════════════════════════════════════
        // RÈGLES BOUNDARIES (ARCHITECTURE)
        // ═══════════════════════════════════════════════════════════
        "boundaries/element-types": [
          "error",
          {
            "default": "disallow",
            "rules": [
              // Core peut importer : rien (sauf shared)
              {
                "from": "core",
                "allow": ["shared"]
              },
              // Shared ne peut rien importer
              {
                "from": "shared",
                "allow": []
              },
              // Features peuvent importer : core, shared
              {
                "from": "features",
                "allow": ["core", "shared"]
              },
              // Layout peut importer : core, shared
              {
                "from": "layout",
                "allow": ["core", "shared"]
              }
            ]
          }
        ],
        "boundaries/no-unknown": "error",
        "boundaries/no-ignored": "error",

        // ═══════════════════════════════════════════════════════════
        // RÈGLES ANTI-PATTERNS
        // ═══════════════════════════════════════════════════════════
        "no-console": ["error", { "allow": ["warn", "error"] }],
        "no-restricted-imports": [
          "error",
          {
            "patterns": [
              {
                "group": ["../../../*"],
                "message": "Import trop profond. Utiliser les alias @core, @shared, @features"
              }
            ],
            "paths": [
              {
                "name": "rxjs",
                "importNames": ["Subject"],
                "message": "Importer depuis 'rxjs' directement, pas de destructuring"
              }
            ]
          }
        ]
      }
    },
    {
      "files": ["*.html"],
      "extends": ["plugin:@angular-eslint/template/recommended"],
      "rules": {
        // Templates
        "@angular-eslint/template/no-negated-async": "error",
        "@angular-eslint/template/use-track-by-function": "error"
      }
    }
  ]
}
```

### 10.4 Configuration Dependency Cruiser

```javascript
// .dependency-cruiser.js
module.exports = {
  forbidden: [
    // ═══════════════════════════════════════════════════════════
    // RÈGLE 1: Pas de dépendances circulaires
    // ═══════════════════════════════════════════════════════════
    {
      name: "no-circular",
      severity: "error",
      comment: "Les dépendances circulaires créent du couplage et des bugs",
      from: {},
      to: {
        circular: true
      }
    },

    // ═══════════════════════════════════════════════════════════
    // RÈGLE 2: Features ne peuvent pas s'importer entre elles
    // ═══════════════════════════════════════════════════════════
    {
      name: "no-feature-to-feature",
      severity: "error",
      comment: "Les features doivent être indépendantes. Utiliser core/shared pour partager.",
      from: {
        path: "^src/app/features/([^/]+)/"
      },
      to: {
        path: "^src/app/features/(?!\\1)[^/]+/"
      }
    },

    // ═══════════════════════════════════════════════════════════
    // RÈGLE 3: Composants ne peuvent pas importer HttpClient
    // ═══════════════════════════════════════════════════════════
    {
      name: "no-http-in-components",
      severity: "error",
      comment: "Les appels HTTP doivent être dans les services, pas les composants",
      from: {
        path: "\\.component\\.ts$"
      },
      to: {
        path: "@angular/common/http"
      }
    },

    // ═══════════════════════════════════════════════════════════
    // RÈGLE 4: Core ne peut pas dépendre de features
    // ═══════════════════════════════════════════════════════════
    {
      name: "no-core-to-features",
      severity: "error",
      comment: "Core est la base, il ne peut pas dépendre des features",
      from: {
        path: "^src/app/core/"
      },
      to: {
        path: "^src/app/features/"
      }
    },

    // ═══════════════════════════════════════════════════════════
    // RÈGLE 5: Shared ne peut dépendre de rien (sauf Angular)
    // ═══════════════════════════════════════════════════════════
    {
      name: "no-shared-to-app",
      severity: "error",
      comment: "Shared doit être autonome",
      from: {
        path: "^src/app/shared/"
      },
      to: {
        path: "^src/app/(core|features|layout)/"
      }
    },

    // ═══════════════════════════════════════════════════════════
    // RÈGLE 6: Pas d'import de fichiers spec dans le code
    // ═══════════════════════════════════════════════════════════
    {
      name: "no-spec-imports",
      severity: "error",
      comment: "Les fichiers de test ne doivent pas être importés dans le code",
      from: {
        pathNot: "\\.spec\\.ts$"
      },
      to: {
        path: "\\.spec\\.ts$"
      }
    }
  ],

  options: {
    doNotFollow: {
      path: "node_modules"
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json"
    },
    reporterOptions: {
      dot: {
        theme: {
          graph: { splines: "ortho" }
        }
      }
    }
  }
};
```

### 10.5 Configuration Husky Pre-commit

```bash
# .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Vérification du code..."

# 1. ESLint
echo "📝 ESLint..."
npm run lint || {
  echo "❌ ESLint a trouvé des erreurs. Commit bloqué."
  exit 1
}

# 2. TypeScript
echo "📘 TypeScript..."
npm run typecheck || {
  echo "❌ Erreurs TypeScript. Commit bloqué."
  exit 1
}

# 3. Dependency Cruiser (Architecture)
echo "🏗️ Vérification architecture..."
npx depcruise src --config .dependency-cruiser.js || {
  echo "❌ Violation d'architecture détectée. Commit bloqué."
  exit 1
}

# 4. Tests affectés (optionnel mais recommandé)
echo "🧪 Tests..."
npm run test:ci || {
  echo "❌ Tests échoués. Commit bloqué."
  exit 1
}

echo "✅ Toutes les vérifications passées!"
```

### 10.6 Scripts package.json

```json
{
  "scripts": {
    "lint": "ng lint",
    "lint:fix": "ng lint --fix",
    "typecheck": "tsc --noEmit",
    "test:ci": "ng test --watch=false --browsers=ChromeHeadless",
    "arch:check": "depcruise src --config .dependency-cruiser.js",
    "arch:graph": "depcruise src --config .dependency-cruiser.js --output-type dot | dot -T svg > architecture.svg",
    "validate": "npm run lint && npm run typecheck && npm run arch:check && npm run test:ci",
    "prepare": "husky install"
  }
}
```

### 10.7 Résumé des protections

| Couche | Outil | Bloque si |
|--------|-------|-----------|
| **Code** | ESLint | `any`, pas de return type, console.log |
| **Angular** | @angular-eslint | Pas de OnPush, mauvais nommage |
| **Modules** | boundaries | Import feature→feature |
| **Architecture** | dependency-cruiser | Circulaire, HTTP dans component |
| **Git** | Husky | Toute erreur ci-dessus |

### 10.8 Visualisation Architecture

```bash
# Générer un graphe SVG de l'architecture
npm run arch:graph

# Ouvre architecture.svg dans le navigateur
# → Visualise les dépendances entre modules
# → Repère les violations
```

---

## 11. Conclusion

Cette migration représente un investissement significatif (~13 jours) mais résout définitivement le problème de conformité des patterns. Angular, par sa nature opinionated, élimine la possibilité de "cowboy coding" et garantit que tout développeur (humain ou IA) produira du code conforme à l'architecture établie.

**Prochaine étape** : Validation de ce document et lancement de la Phase 0.

---

*Document rédigé selon les standards d'architecture logicielle enterprise.*
