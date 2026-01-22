# DataTalk - Plateforme SaaS d'Analytics Conversationnel

> **Opportunité Marché** : Le marché Text-to-SQL est estimé à $2-5B d'ici 2027. Avec ~100 concurrents sérieux, si on capture 0.1% = $2-5M ARR potentiel.

## Vision Produit

**DataTalk** est une plateforme SaaS de Business Intelligence conversationnelle qui permet aux entreprises d'interroger leurs données en langage naturel.

**Concurrent direct** : [Omni.co](https://omni.co), Metabase, Looker

**Proposition de valeur** :
- Chat conversationnel pour interroger ses données (pas de SQL requis)
- Catalogue sémantique auto-généré par LLM
- Visualisations automatiques (graphiques, tableaux)
- Multi-tenant isolé (une instance par client)

---

## Architecture Multi-Tenant

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ARCHITECTURE MULTI-TENANT ISOLÉE                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  WRAPPER (Gestion des Tenants)                                      │   │
│  │  - Provisioning nouveaux clients                                    │   │
│  │  - Billing / Subscription                                           │   │
│  │  - Routing vers les instances                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│          ┌──────────────────┼──────────────────┐                           │
│          ▼                  ▼                  ▼                            │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                    │
│  │  TENANT A    │   │  TENANT B    │   │  TENANT C    │                    │
│  │  (Client 1)  │   │  (Client 2)  │   │  (Client 3)  │                    │
│  │              │   │              │   │              │                    │
│  │  ┌────────┐  │   │  ┌────────┐  │   │  ┌────────┐  │                    │
│  │  │  Core  │  │   │  │  Core  │  │   │  │  Core  │  │                    │
│  │  │DataTalk│  │   │  │DataTalk│  │   │  │DataTalk│  │                    │
│  │  └────────┘  │   │  └────────┘  │   │  └────────┘  │                    │
│  │              │   │              │   │              │                    │
│  │  DuckDB      │   │  DuckDB      │   │  DuckDB      │                    │
│  │  SQLite      │   │  SQLite      │   │  SQLite      │                    │
│  └──────────────┘   └──────────────┘   └──────────────┘                    │
│                                                                             │
│  Avantages:                                                                 │
│  - Isolation totale des données clients                                     │
│  - Pas de risque de fuite entre tenants                                     │
│  - Scale horizontal simple (1 instance = 1 client)                          │
│  - Customisation possible par client                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Stack Technique (Core)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CORE DATATALK (déployé par tenant)                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  Next.js 15 │───▶│  FastAPI    │───▶│  LLM        │───▶│  DuckDB     │  │
│  │  + Tailwind │    │  Python     │    │  (Gemini/   │    │  (OLAP)     │  │
│  │  + Zustand  │    │             │    │   OpenAI)   │    │             │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│        │                  │                                                 │
│        │                  ▼                                                 │
│        │           ┌─────────────┐                                          │
│        └──────────▶│   SQLite    │  Catalogue sémantique + Conversations   │
│                    │  (Catalog)  │  + Rapports + Settings                   │
│                    └─────────────┘                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Composants

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| **Frontend** | Next.js 15 + Tailwind + Zustand | Interface utilisateur moderne |
| **Backend** | FastAPI (Python) | API REST + WebSocket |
| **LLM** | Gemini 2.0 Flash / OpenAI | Text-to-SQL + Enrichissement catalogue |
| **Base analytique** | DuckDB | Stockage données client (OLAP optimisé) |
| **Catalogue** | SQLite | Métadonnées, conversations, settings |
| **Déploiement** | Docker Compose | Container isolé par tenant |

---

## Fonctionnalités Clés

### 1. Chat Conversationnel
- Questions en langage naturel → SQL généré automatiquement
- Historique des conversations
- Suggestions de questions contextuelles

### 2. Catalogue Sémantique
- Extraction automatique des métadonnées (tables, colonnes)
- Enrichissement LLM (descriptions, synonymes, KPIs)
- Relations entre tables détectées

### 3. Visualisations
- Graphiques automatiques (bar, line, pie, scatter)
- Tableaux de données paginés
- Export des résultats

### 4. Multi-Dataset
- Support de plusieurs sources de données
- Switch entre datasets
- Isolation des données par dataset

### 5. Internationalisation
- Interface FR/EN
- Architecture frontend-agnostic (Zustand store)
- Traductions via JSON locales

### 6. Theming
- 6 thèmes de couleurs (Default, Ocean, Forest, Sunset, Purple, Monochrome)
- Mode clair/sombre
- Persistance des préférences

---

## Structure du Projet

```
datalakeG7/
├── frontend/                 # Next.js 15 App
│   ├── src/
│   │   ├── app/             # Pages (App Router)
│   │   ├── components/      # Composants React
│   │   ├── hooks/           # Custom hooks
│   │   ├── stores/          # Zustand stores
│   │   ├── lib/             # API client, utils
│   │   └── locales/         # Traductions i18n
│   └── public/
│
├── backend/                  # FastAPI Python
│   ├── main.py              # Entry point
│   ├── routes/              # Endpoints API
│   ├── services/            # Business logic
│   ├── locales/             # Traductions backend
│   └── catalog.sqlite       # Base catalogue
│
├── docker-compose.yml        # Orchestration
└── .claude/                  # Configuration Claude Code
```

---

## Commandes de Développement

```bash
# Lancer en développement
docker compose up --build

# Frontend seul
cd frontend && npm run dev

# Backend seul
cd backend && uvicorn main:app --reload

# TypeScript check
cd frontend && npm run typecheck

# Lint
cd frontend && npm run lint
cd backend && ruff check .
```

---

## Schéma Base de Données (SQLite Catalogue)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CATALOGUE SÉMANTIQUE                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  datasets ──1:N──▶ tables ──1:N──▶ columns ──1:N──▶ synonyms               │
│                                           │                                 │
│                                           └──────▶ relationships            │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  INTERFACE UTILISATEUR                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  conversations ──1:N──▶ messages                                            │
│       │                    ├── role (user/assistant)                        │
│       │                    ├── content                                      │
│       │                    ├── sql_query                                    │
│       │                    ├── chart_config (JSON)                          │
│       │                    └── response_time_ms                             │
│       │                                                                     │
│       └──────────────────▶ saved_reports (favoris)                          │
│                                                                             │
│  predefined_questions ──▶ Questions suggérées par catégorie                 │
│                                                                             │
│  settings ──────────────▶ Configuration (LLM, theme, langue)                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Conventions de Code

### Frontend (TypeScript/React)
- **State global** : Zustand stores (pas de Context sauf pour providers)
- **i18n** : `t("key")` via `useTranslation` hook
- **Styling** : Tailwind CSS + variables CSS pour theming
- **Composants** : Functional components, pas de class components

### Backend (Python)
- **Framework** : FastAPI avec async/await
- **Formatage** : Ruff
- **i18n** : `t("key")` via module `i18n.py`
- **Base** : SQLite pour catalogue, DuckDB pour données analytiques

---

## Roadmap

### Phase 1 - MVP (Actuel)
- [x] Chat conversationnel
- [x] Catalogue sémantique
- [x] Visualisations automatiques
- [x] Multi-dataset
- [x] i18n FR/EN
- [x] Theming

### Phase 2 - Enterprise
- [ ] Wrapper multi-tenant
- [ ] Authentication (OAuth/SAML)
- [ ] Audit logs
- [ ] API publique
- [ ] Webhooks

### Phase 3 - Scale
- [ ] Kubernetes deployment
- [ ] Caching layer (Redis)
- [ ] Real-time collaboration
- [ ] SDK client

---

## Ressources

- **Concurrent** : [Omni.co](https://omni.co)
- **Inspiration** : Metabase, Looker, Mode Analytics
- **LLM** : [Gemini API](https://ai.google.dev/), [OpenAI](https://platform.openai.com/)
- **DuckDB** : [Documentation](https://duckdb.org/docs/)
