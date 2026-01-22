# Stratégie Core Industriel - G7 Analytics

> **Vision** : Un Core unique déployable en multi-tenant (1 instance = 1 client)
> **Philosophie** : Simplifier, pas complexifier. Si c'est compliqué, c'est mal conçu.

---

## 1. Architecture Cible

```
┌─────────────────────────────────────────────────────────────────┐
│                        FERME G7                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Tenant A │  │ Tenant B │  │ Tenant C │  │ Tenant D │        │
│  │ Client 1 │  │ Client 2 │  │ Client 3 │  │ Client 4 │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │                │
│       └─────────────┴─────────────┴─────────────┘                │
│                           │                                      │
│                    ┌──────┴──────┐                              │
│                    │   G7 CORE   │  ← Code identique partout    │
│                    │  (Docker)   │                              │
│                    └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

### Ce qui est dans le CORE (identique pour tous)
- Code frontend React
- Code backend FastAPI
- Schéma de base SQLite (metadata)
- Connexion DuckDB (données client)
- Système de thèmes
- i18n (FR/EN)

### Ce qui est par TENANT (configuration)
- Variables d'environnement (.env)
- Fichier DuckDB du client (ses données)
- Logo/branding (optionnel)
- Clés API (OpenAI, etc.)

---

## 2. Simplification State Management

### AVANT (bordel actuel)
```
useState local + useEffect + API directe
    ↓
hooks wrappers (useConversation.ts)
    ↓
Zustand stores (useConversationStore.ts)
    ↓
API functions (/lib/api/)
```

### APRÈS (pattern unique)
```
Composant
    ↓
useXxxStore() ← Zustand direct, pas de wrapper
    ↓
API functions (/lib/api/)
```

### Règles Zustand

| Règle | Explication |
|-------|-------------|
| **1 store = 1 domaine** | Dataset, Conversation, Theme, Layout, Language |
| **Pas de hooks wrapper** | Appeler `useDatasetStore()` directement |
| **Actions dans le store** | Pas de logique métier dans les composants |
| **Persist sélectif** | Ne persister que ce qui doit survivre au refresh |

### Stores à garder (5 max)

```
/stores/
├── useDatasetStore.ts      # Dataset actif + liste
├── useConversationStore.ts # Chat + messages + historique
├── useThemeStore.ts        # Theme style (corporate, gcp, etc.)
├── useLayoutStore.ts       # Panels, sidebar, resize
└── useLanguageStore.ts     # Locale (fr/en)
```

### Hooks à garder (minimum)

```
/hooks/
├── useTranslation.ts       # i18n - GARDER
└── useLayout.ts            # Resize logic avec refs - GARDER (refs ≠ Zustand)
```

### À SUPPRIMER
```
/hooks/useConversation.ts   # ❌ Wrapper inutile → utiliser useConversationStore direct
```

---

## 3. Pattern API Unifié

### Structure
```
/lib/api/
├── index.ts          # Exports centralisés
├── types.ts          # Types partagés
├── client.ts         # ← NOUVEAU: client API avec datasetId automatique
├── datasets.ts
├── catalog.ts
├── conversations.ts
└── ...
```

### Client API avec Dataset + Langue Automatiques

```typescript
// /lib/api/client.ts
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useLanguageStore } from "@/stores/useLanguageStore";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Client API qui injecte automatiquement:
 * - dataset_id: pour le contexte data
 * - Accept-Language: pour les réponses traduites
 */
export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  config: { includeDataset?: boolean; includeLocale?: boolean } = {}
): Promise<Response> {
  const { includeDataset = true, includeLocale = true } = config;
  const url = new URL(endpoint, API_BASE);

  // Injection automatique du dataset actif
  if (includeDataset) {
    const activeDataset = useDatasetStore.getState().activeDataset;
    if (activeDataset) {
      url.searchParams.set("dataset_id", activeDataset.id);
    }
  }

  // Injection automatique de la langue
  const locale = useLanguageStore.getState().locale;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(includeLocale && { "Accept-Language": locale }),
    ...options.headers,
  };

  return fetch(url.toString(), {
    ...options,
    headers,
  });
}
```

### Utilisation

```typescript
// AVANT - dataset et langue non propagés
const catalog = await fetchCatalog();

// APRÈS - tout injecté automatiquement
const catalog = await fetchCatalog();
// → GET /catalog?dataset_id=xxx
// → Header: Accept-Language: fr
```

### Backend: Récupérer la langue

```python
# FastAPI - middleware ou dépendance
from fastapi import Request, Depends

def get_locale(request: Request) -> str:
    """Récupère la langue depuis le header Accept-Language"""
    accept_lang = request.headers.get("Accept-Language", "fr")
    return accept_lang if accept_lang in ["fr", "en"] else "fr"

@router.get("/catalog")
async def get_catalog(
    dataset_id: str,
    locale: str = Depends(get_locale)
):
    # locale = "fr" ou "en"
    # Utiliser pour les messages d'erreur, descriptions, etc.
    pass
```

---

## 4. Structure Dossiers Cible

```
frontend/
├── src/
│   ├── app/                    # Pages (Next.js App Router)
│   │   ├── page.tsx            # Home
│   │   ├── catalog/
│   │   ├── datasets/
│   │   ├── runs/
│   │   └── settings/
│   │
│   ├── components/             # Composants
│   │   ├── ui/                 # Primitives (Button, Card, Input)
│   │   ├── layout/             # Layout (Sidebar, Header)
│   │   ├── catalog/            # Composants Catalog
│   │   ├── chat/               # Composants Chat
│   │   ├── datasets/           # Composants Datasets
│   │   └── settings/           # Composants Settings
│   │
│   ├── stores/                 # Zustand (5 stores max)
│   │   ├── index.ts
│   │   ├── useDatasetStore.ts
│   │   ├── useConversationStore.ts
│   │   ├── useThemeStore.ts
│   │   ├── useLayoutStore.ts
│   │   └── useLanguageStore.ts
│   │
│   ├── hooks/                  # Hooks custom (minimum)
│   │   ├── useTranslation.ts
│   │   └── useLayout.ts        # Resize avec refs
│   │
│   ├── lib/                    # Utilitaires
│   │   ├── api/                # Fonctions API
│   │   ├── utils.ts            # Helpers
│   │   └── constants.ts        # Constantes
│   │
│   ├── types/                  # Types TypeScript
│   │   └── index.ts
│   │
│   └── locales/                # i18n
│       ├── fr.json
│       └── en.json
│
├── public/                     # Assets statiques
└── package.json
```

---

## 5. Règles du Core

### Règle 1: Un seul pattern par chose

| Besoin | Solution unique |
|--------|-----------------|
| État global | Zustand store |
| État local UI | useState (rare) |
| Appels API | /lib/api/ functions |
| Styles | Tailwind + CSS variables |
| i18n | useTranslation hook |

### Règle 2: Propagation Automatique (Dataset + Langue)

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│                                                                 │
│  DatasetHeader          LanguageSelector                        │
│       │                       │                                 │
│       ▼                       ▼                                 │
│  useDatasetStore         useLanguageStore                       │
│  (activeDataset)         (locale: "fr"|"en")                    │
│       │                       │                                 │
│       └───────────┬───────────┘                                 │
│                   ▼                                             │
│            apiFetch() ← Injection automatique                   │
│                   │                                             │
└───────────────────┼─────────────────────────────────────────────┘
                    │
                    ▼
        GET /catalog?dataset_id=xxx
        Header: Accept-Language: fr
                    │
┌───────────────────┼─────────────────────────────────────────────┐
│                   ▼                          BACKEND            │
│                                                                 │
│  get_locale() ← Dependency injection                            │
│  get_dataset_id() ← Query param                                 │
│       │                                                         │
│       ▼                                                         │
│  Route handler reçoit (dataset_id, locale)                      │
│       │                                                         │
│       ▼                                                         │
│  Réponse en FR ou EN selon locale                               │
│  Données du bon dataset                                         │
└─────────────────────────────────────────────────────────────────┘
```

**Résultat**: Changer de langue OU de dataset → TOUT se met à jour automatiquement.

### Règle 3: Pas de logique métier dans les composants

```typescript
// ❌ MAUVAIS
function CatalogPage() {
  const [catalog, setCatalog] = useState([]);
  useEffect(() => {
    fetch("/catalog").then(r => r.json()).then(setCatalog);
  }, []);
}

// ✅ BON
function CatalogPage() {
  const catalog = useCatalogStore((s) => s.catalog);
  const loadCatalog = useCatalogStore((s) => s.loadCatalog);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);
}
```

### Règle 4: Composants < 150 lignes

Si un composant dépasse 150 lignes → le splitter.

### Règle 5: Pas de Context API

Zustand remplace complètement React Context pour l'état global.
Exception: Providers externes (NextThemes, ReactFlow).

---

## 6. Plan de Migration

### Phase 1: Nettoyage (1-2 jours)
Phase 1 : Core Module
├── Setup ESLint strict
├── Setup eslint-plugin-boundaries
├── Setup dependency-cruiser
└── Setup Husky pre-commit
- [ ] Supprimer `/hooks/useConversation.ts`
- [ ] Migrer les appels vers `useConversationStore` direct
- [ ] Créer `/lib/api/client.ts` avec injection dataset_id
- [ ] Fix ESLint warning (`DEFAULT_LOCALE`)

### Phase 2: Propagation Dataset (1 jour)
- [ ] Modifier `apiFetch()` pour injecter dataset_id
- [ ] Vérifier que toutes les pages utilisent les stores
- [ ] Tester: changer de dataset → catalog/runs/chat changent

### Phase 3: Documentation (0.5 jour)
- [ ] Mettre à jour CLAUDE.md avec les règles
- [ ] Ajouter des exemples de code
- [ ] Intégrer outil de documentation (si besoin)

### Phase 4: Tests (1 jour)
- [ ] Tests pour les stores
- [ ] Tests pour l'injection dataset_id
- [ ] Tests E2E propagation

---

## 7. Configuration Multi-Tenant

### Variables d'environnement par tenant

```env
# .env.tenant-clientA
TENANT_ID=client-a
TENANT_NAME="Client A Corp"
DUCKDB_PATH=/data/client-a.duckdb
OPENAI_API_KEY=sk-xxx
BRANDING_LOGO=/branding/client-a-logo.png
```

### Docker Compose par tenant

```yaml
# docker-compose.client-a.yml
services:
  g7-core:
    image: g7-analytics:latest
    env_file: .env.tenant-clientA
    volumes:
      - ./data/client-a:/data
    ports:
      - "8001:8000"
```

### Ferme = Orchestrateur

```
┌─────────────────────────────────────────┐
│            ORCHESTRATEUR                │
│  (Portainer / Kubernetes / Docker Swarm)│
│                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ :8001   │ │ :8002   │ │ :8003   │   │
│  │Client A │ │Client B │ │Client C │   │
│  └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────┘
```

---

## 8. Checklist "Est-ce que c'est Core-ready?"

Avant chaque PR, vérifier:

- [ ] Pas de logique métier dans les composants
- [ ] Utilise `useXxxStore()` direct (pas de wrapper)
- [ ] Pas de `useState` pour état global
- [ ] API passe par `/lib/api/` functions
- [ ] Fonctionne avec n'importe quel dataset actif
- [ ] Pas de hardcoding (URLs, clés, etc.)
- [ ] < 150 lignes par composant
- [ ] ESLint OK, TypeScript OK

---

## Résumé

| Avant | Après |
|-------|-------|
| 3 patterns différents | 1 seul pattern |
| Hooks wrappers inutiles | Zustand direct |
| Dataset non propagé | Injection automatique |
| Code spaghetti | Architecture Core claire |
| 1 déploiement | Multi-tenant ready |

**Objectif**: Un Core propre, déployable N fois, configurable par .env.
