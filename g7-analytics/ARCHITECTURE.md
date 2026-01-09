# G7 Analytics - Architecture

## Vue d'ensemble

G7 Analytics est une solution Text-to-SQL permettant d'interroger une base de données d'évaluations clients en langage naturel, avec visualisation graphique des résultats.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Next.js)                            │
│  ┌──────────────┐  ┌──────────────────────┐  ┌───────────────────────┐  │
│  │   Zone 1     │  │       Zone 2         │  │       Zone 3          │  │
│  │  Questions   │  │   Chat + Résultats   │  │   Analytics & KPIs    │  │
│  │  prédéfinies │  │   Table + Graphique  │  │   Statistiques        │  │
│  └──────────────┘  └──────────────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (FastAPI)                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │  /analyze        │  │  /conversations  │  │  /semantic-stats      │  │
│  │  Text → SQL      │  │  Historique      │  │  KPIs thématiques     │  │
│  └──────────────────┘  └──────────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
         │                         │                        │
         ▼                         ▼                        ▼
┌─────────────────┐     ┌─────────────────┐      ┌─────────────────────┐
│  Gemini 2.0     │     │    SQLite       │      │      DuckDB         │
│  Flash (LLM)    │     │   (Catalog)     │      │   (Data Store)      │
│                 │     │                 │      │                     │
│  Reçoit SCHEMA  │     │  - Métadonnées  │      │  - 64 385 évals     │
│  uniquement     │     │  - Synonymes    │      │  - Vue dénormalisée │
│  PAS les données│     │  - Historique   │      │                     │
└─────────────────┘     └─────────────────┘      └─────────────────────┘
```

## Stack technique

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| Frontend | Next.js 15, React 19, TypeScript | Interface utilisateur |
| UI | Tailwind CSS, shadcn/ui | Design system |
| Graphiques | Recharts | Visualisation données |
| Backend | FastAPI (Python 3.11+) | API REST |
| Base analytique | DuckDB | Stockage et requêtes OLAP |
| Catalogue | SQLite | Métadonnées, historique, settings |
| LLM | Google Gemini 2.0 Flash | Génération SQL |

## Le point clé : confidentialité des données

### Ce que le LLM reçoit

```
Table: evaluations (64 385 lignes)
Colonnes:
  - cod_taxi (INTEGER): Identifiant unique du chauffeur
  - note_eval (DECIMAL, 1-5): Note globale donnée par le client
  - commentaire (VARCHAR): Commentaire libre du client
  - typ_client (VARCHAR): Segment client (ex: "CLUB AFFAIRES")
  ...
```

### Ce que le LLM ne reçoit JAMAIS

```
❌ Les valeurs réelles des colonnes
❌ Les commentaires des clients
❌ Les identifiants chauffeurs/clients
❌ Aucune donnée personnelle ou métier
```

### Flux de données

```
1. Utilisateur: "Quelle est la note moyenne par type de client ?"
                              │
                              ▼
2. Backend envoie au LLM:   SCHEMA uniquement
                              │
                              ▼
3. LLM génère:              SELECT typ_client, AVG(note_eval)
                            FROM evaluations GROUP BY typ_client
                              │
                              ▼
4. Backend exécute:         SQL sur DuckDB (local)
                              │
                              ▼
5. Résultats affichés:      Données réelles → Frontend
```

**Les données ne transitent jamais par le LLM.** Seul le schéma (structure des tables) est partagé pour permettre la génération SQL.

## Pourquoi cette solution ?

### Le besoin

- Permettre aux équipes métier d'interroger les données sans connaître SQL
- Interface moderne et intuitive (pas un terminal ou un notebook)
- Visualisation graphique automatique selon le type de résultat
- **Contrainte critique** : ne pas exposer les données clients à un service externe

### Ce qui existe sur le marché

| Solution | Text-to-SQL | UI moderne | Données privées | Verdict |
|----------|-------------|------------|-----------------|---------|
| ChatGPT + Code Interpreter | ✅ | ❌ | ❌ Upload requis | Non |
| Tableau AI / Power BI Copilot | Partiel | ✅ | ❌ Cloud | Non |
| LangChain SQL Agent | ✅ | ❌ Terminal | Configurable | Partiel |
| Metabase + AI (beta) | Partiel | ✅ | ❌ | Non |
| DBeaver AI | ✅ | ❌ IDE | ❌ | Non |

**Constat** : Aucune solution existante ne combine :
1. Text-to-SQL fiable avec LLM moderne
2. Interface graphique soignée (pas un terminal)
3. Garantie que les données restent locales

### Notre approche

Si une solution clé en main avait existé avec ces trois critères, nous l'aurions adoptée. En l'absence d'alternative satisfaisante, nous avons construit une solution sur mesure qui :

- Utilise un **catalogue de métadonnées** enrichi (descriptions, synonymes, exemples de valeurs)
- Envoie **uniquement le schéma** au LLM pour générer le SQL
- Exécute les requêtes **localement** sur DuckDB
- Propose une **UI moderne** avec visualisation automatique

## Structure du projet

```
g7-analytics/
├── src/
│   └── app/
│       ├── page.tsx          # Dashboard principal (3 zones)
│       └── components/
│           ├── DataTable.tsx # Tableau de résultats
│           └── Chart.tsx     # Graphiques Recharts
├── backend/
│   ├── main.py               # API FastAPI
│   ├── catalog.py            # Gestion catalogue SQLite
│   ├── seed_catalog.py       # Peuplement métadonnées
│   ├── enrich_comments.py    # Enrichissement IA (sentiment)
│   └── create_categories_view.py
├── data/
│   ├── g7_analytics.duckdb   # Base analytique
│   └── catalog.db            # Métadonnées + historique
└── ARCHITECTURE.md
```

## Points forts de l'architecture

1. **Séparation schema/data** : Le LLM ne voit que la structure, jamais les valeurs
2. **Catalogue enrichi** : Synonymes et descriptions pour améliorer la compréhension du LLM
3. **DuckDB embarqué** : Performance analytique sans serveur externe
4. **Vue dénormalisée** : `evaluation_categories` pour requêtes thématiques simplifiées
5. **Historique conversationnel** : Contexte maintenu pour des échanges naturels

## Schéma des zones UI

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                    ÉCRAN                                         │
├────────┬─────────────────────────────────────────────────────────────────────────┤
│        │                              HEADER                                     │
│        │  ┌────────────────────────────────────────────────────────────────────┐ │
│ SIDEBAR│  │ [G7]  G7 Analytics               [●] gemini-2.0-flash    [⚙]     │ │
│ (global)  │       Text-to-SQL Dashboard                                        │ │
│        │  └────────────────────────────────────────────────────────────────────┘ │
│ ┌────┐ │                                                                         │
│ │ ☰  │ ├──────────────┬────────────────────────────────┬────────────────────────┤
│ ├────┤ │   ZONE 1     │         ZONE 2                 │      ZONE 3            │
│ │ 📊 │ │   ChatZone   │    VisualizationZone           │   AnalyticsZone        │
│ │    │ │              │                                │                        │
│ │    │ │  - Chat IA   │  - KPIs globaux                │  - KPIs sémantiques    │
│ │    │ │  - Questions │  - Filtres                     │  - Distribution        │
│ │    │ │    prédéfinies│  - Graphique Recharts         │  - Alertes             │
│ │    │ │  - Historique│  - DataTable                   │  - Points forts        │
│ │    │ │  - Input     │  - Sauvegarder rapport         │  - Rapports sauvés     │
│ └────┘ │              │                                │                        │
│        │  Collapsed:  │  (non collapsable)             │  Collapsed:            │
│        │  [💬] chat   │                                │  [📈] graphique        │
│        └──────────────┴────────────────────────────────┴────────────────────────┘
└──────────────────────────────────────────────────────────────────────────────────┘

Légende:
- SIDEBAR (Sidebar.tsx)     : Navigation globale du site, icône hamburger ☰
- HEADER (Header.tsx)       : Logo G7 + titre + status API + settings
- ZONE 1 (ChatZone.tsx)     : Chat conversationnel, collapsable → icône 💬
- ZONE 2 (VisualizationZone.tsx) : Graphiques et données
- ZONE 3 (AnalyticsZone.tsx): Stats sémantiques, collapsable → icône 📈
```

**Icônes par zone (collapsed):**
| Zone | Fichier | Icône collapsed | Description |
|------|---------|-----------------|-------------|
| Sidebar | Sidebar.tsx | ☰ (hamburger) | Menu navigation |
| Zone 1 | ChatZone.tsx | 💬 (bulle chat) | Ouvrir le chat |
| Zone 3 | AnalyticsZone.tsx | 📈 (graphique) | Ouvrir analyse IA |

**Logo G7:** Uniquement dans le Header (composant Header.tsx)

---

## Structure frontend après refactoring (Janvier 2025)

```
g7-analytics/src/
├── app/
│   └── page.tsx              # 467 lignes (orchestration)
├── components/
│   ├── ChatZone.tsx          # 371 lignes (Zone 1: Chat)
│   ├── VisualizationZone.tsx # 272 lignes (Zone 2: Graphiques)
│   ├── AnalyticsZone.tsx     # 271 lignes (Zone 3: Stats)
│   ├── Chart.tsx             # Graphiques Recharts
│   └── DataTable.tsx         # Tableau de données
├── lib/
│   ├── api.ts                # Service API centralisé
│   └── schema.ts             # Types ChartConfig
└── types/
    └── index.ts              # Types partagés
```

---

## Plan de refactoring - Dette technique

### Objectif
Éliminer la duplication de code entre `page.tsx` et `api.ts` tout en préservant l'UI/UX existante.

### Règles de sécurité
1. **Commit après chaque phase** (rollback possible)
2. **Test `npm run build`** après chaque modification
3. **Iso-fonctionnalité** : aucun changement visible pour l'utilisateur
4. **Préserver les side effects** : ne pas oublier les setState/callbacks

---

### Phase 1A : Fetchers simples (SANS RISQUE)
**Risque : Très faible | Valeur : Haute | ~45 lignes supprimées**

| Fonction locale (page.tsx) | Remplacement (api.ts) | Side effects |
|---------------------------|----------------------|--------------|
| `checkApiStatus` L99-107 | `api.checkApiStatus()` | `setApiStatus` |
| `fetchPredefinedQuestions` L109-117 | `api.fetchPredefinedQuestions()` | `setPredefinedQuestions` |
| `fetchSavedReports` L119-127 | `api.fetchSavedReports()` | `setSavedReports` |
| `fetchConversations` L129-137 | `api.fetchConversations()` | `setConversations` |
| `fetchSemanticStats` L139-147 | `api.fetchSemanticStats()` | `setSemanticStats` |

**Action :**
```tsx
// Avant
const fetchSavedReports = async () => {
  try {
    const res = await fetch("http://localhost:8000/reports");
    const data = await res.json();
    setSavedReports(data.reports || []);
  } catch (e) { console.error(...) }
};

// Après
import * as api from "@/lib/api";
const loadReports = () => api.fetchSavedReports().then(setSavedReports);
```

- [x] Importer api.ts
- [x] Supprimer les 5 fonctions locales
- [x] Créer `loadReports` et `loadConversations` (utilisés ailleurs)
- [x] Adapter le useEffect initial
- [x] Commit: `refactor: utilise api.ts pour les fetchers simples`

---

### Phase 1B : handleSaveReport (FAIBLE RISQUE)
**Risque : Faible | Valeur : Moyenne | ~5 lignes**

| Aspect | Avant | Après |
|--------|-------|-------|
| Fetch | Inline L272-283 | `api.saveReport()` |
| Post-action | `fetchSavedReports()` | `loadReports()` |

- [x] Remplacer le fetch par `api.saveReport()`
- [x] Garder `loadReports()` après
- [x] Commit: `refactor: handleSaveReport utilise api.ts`

---

### Phase 1C : handleDeleteReport (FAIBLE RISQUE)
**Risque : Faible | Valeur : Moyenne | ~3 lignes**

- [x] Remplacer le fetch par `api.deleteReport()`
- [x] Garder `loadReports()` après
- [x] Commit: `refactor: handleDeleteReport utilise api.ts`

---

### Phase 1D : handleLoadConversation (FAIBLE RISQUE)
**Risque : Faible | Valeur : Moyenne | ~4 lignes**

| Side effects à préserver |
|-------------------------|
| `setCurrentConversationId(conv.id)` |
| `setSelectedMessage(null)` |
| `setShowHistory(false)` |

- [x] Remplacer le fetch par `api.fetchConversationMessages()`
- [x] Garder les 3 side effects
- [x] Commit: `refactor: handleLoadConversation utilise api.ts`

---

### Phase 1E : handleSaveApiKey (FAIBLE RISQUE)
**Risque : Faible | Valeur : Faible | ~4 lignes**

| Side effects à préserver |
|-------------------------|
| `setApiKey("")` |
| `setShowSettings(false)` |
| `checkApiStatus()` → `api.checkApiStatus().then(setApiStatus)` |

- [x] Remplacer le fetch par `api.saveApiKey()`
- [x] Garder les 3 side effects
- [x] Commit: `refactor: handleSaveApiKey utilise api.ts`

---

### Phase 2A : createNewConversation (RISQUE MOYEN)
**Risque : Moyen | Valeur : Moyenne | ~5 lignes**

| Side effects critiques |
|-----------------------|
| `setCurrentConversationId(data.id)` |
| `setMessages([])` |
| `setSelectedMessage(null)` |
| `loadConversations()` |
| `return data.id` (utilisé par handleSubmit) |

- [x] Utiliser `api.createConversation()` pour le fetch
- [x] Garder TOUS les side effects
- [x] S'assurer que le `return data.id` fonctionne
- [x] Commit: `refactor: createNewConversation utilise api.ts`

---

### Phase 2B : handleSubmit (RISQUE MOYEN)
**Risque : Moyen | Valeur : Haute | ~10 lignes**

| Aspect | Comportement actuel |
|--------|-------------------|
| Appel API | `fetch(/conversations/${convId}/analyze)` |
| Gestion erreur | Crée un `errorMessage` local |
| Post-action | `setMessages`, `setSelectedMessage`, `loadConversations` |

- [x] Utiliser `api.analyzeInConversation()`
- [x] Adapter le catch pour créer `errorMessage`
- [x] Garder tous les side effects
- [x] Commit: `refactor: handleSubmit utilise api.ts`

---

### Phase 3 : KPIs dynamiques (NOUVELLE FEATURE)
**Risque : Moyen | Valeur : Haute**

Actuellement les KPIs dans VisualizationZone sont hardcodés :
```tsx
// VisualizationZone.tsx L87-101
<p>64 385</p>  // Évaluations - HARDCODÉ
<p>4.84</p>    // Note moyenne - HARDCODÉ
<p>7 256</p>   // Commentaires - HARDCODÉ
<p>9 492</p>   // Chauffeurs - HARDCODÉ
```

- [x] Créer endpoint `GET /stats/global` dans backend
- [x] Ajouter type `GlobalStats` dans types/index.ts
- [x] Ajouter `fetchGlobalStats()` dans api.ts
- [x] Passer les KPIs en props à VisualizationZone
- [x] Commit: `feat: KPIs dynamiques depuis API`

---

### Phase 4 : Sidebar globale + Multi-pages (REFACTORING STRUCTURE)
**Risque : Moyen | Valeur : Haute**

**Objectif** : Créer une sidebar de navigation partagée entre toutes les pages.

**Ce qu'il ne faut PAS casser** :

| Élément | Fichier actuel | État/Props | Action |
|---------|----------------|------------|--------|
| Header (logo, status API, settings) | page.tsx L283-313 | `apiStatus`, `showSettings` | Extraire → Header.tsx |
| Settings Panel | page.tsx L316-333 | `apiKey`, `showSettings` | Garder dans Header.tsx |
| ChatZone + toute sa logique | page.tsx L338-359 | 15+ états | NE PAS TOUCHER |
| VisualizationZone | page.tsx L374-380 | props | NE PAS TOUCHER |
| AnalyticsZone | page.tsx L395-404 | props | NE PAS TOUCHER |
| Resize handles | page.tsx L362-392 | `isResizing`, widths | NE PAS TOUCHER |
| useEffect initial | page.tsx L56-63 | 6 appels API | Reste dans analytics/page.tsx |

**Structure cible** :
```
src/
├── app/
│   ├── layout.tsx          # MODIFIÉ: Sidebar + Header
│   ├── page.tsx            # MODIFIÉ: redirect → /analytics
│   └── analytics/
│       └── page.tsx        # NOUVEAU: contenu actuel de page.tsx
├── components/
│   ├── Sidebar.tsx         # NOUVEAU
│   ├── Header.tsx          # NOUVEAU (extrait de page.tsx)
│   └── ... (inchangés)
```

#### Phase 4A : Créer Sidebar.tsx (SANS RISQUE)
**Risque : Très faible | Composant isolé**

- [ ] Créer `components/Sidebar.tsx`
- [ ] Menu rétractable (collapsed/expanded)
- [ ] Items: Analytics (actif), [Nouvelle page] (placeholder)
- [ ] Style cohérent avec ChatZone collapsed
- [ ] Commit: `feat: composant Sidebar navigation`

#### Phase 4B : Créer Header.tsx (FAIBLE RISQUE)
**Risque : Faible | Extraction simple**

| Props à passer |
|----------------|
| `apiStatus` |
| `showSettings` / `onShowSettingsChange` |
| `apiKey` / `onApiKeyChange` |
| `onSaveApiKey` |

- [ ] Créer `components/Header.tsx`
- [ ] Copier le JSX du header depuis page.tsx
- [ ] Ajouter les props nécessaires
- [ ] NE PAS supprimer de page.tsx encore
- [ ] Commit: `feat: composant Header extrait`

#### Phase 4C : Modifier layout.tsx (RISQUE MOYEN)
**Risque : Moyen | Point critique**

- [ ] Importer Sidebar dans layout.tsx
- [ ] Structure: `<Sidebar /> + <main>{children}</main>`
- [ ] Gérer état `sidebarCollapsed` dans layout
- [ ] Tester que page.tsx fonctionne toujours
- [ ] Commit: `feat: layout avec Sidebar globale`

#### Phase 4D : Créer analytics/page.tsx (RISQUE MOYEN)
**Risque : Moyen | Déplacement de code**

- [ ] Créer dossier `app/analytics/`
- [ ] Copier page.tsx → analytics/page.tsx
- [ ] Supprimer le Header (déjà dans layout)
- [ ] Adapter les imports si nécessaire
- [ ] Modifier page.tsx racine → redirect vers /analytics
- [ ] Commit: `refactor: page analytics séparée`

#### Phase 4E : Test final
- [ ] `npm run build` passe
- [ ] Navigation / → /analytics fonctionne
- [ ] Sidebar rétractable fonctionne
- [ ] Toutes les fonctionnalités Analytics préservées
- [ ] Commit: `test: validation multi-pages`

---

---

## Checklist Dette Technique

> Lancez `npm run analyze` pour un rapport automatique.

### Priorité 1 : Duplications (Sans risque)

| Tâche | Fichier | Effort | Status |
|-------|---------|--------|--------|
| Migrer SVG vers icons.tsx | DataTable.tsx | 5 min | [x] |
| Migrer SVG vers icons.tsx | VisualizationZone.tsx | 5 min | [x] |

### Priorité 2 : Complexité (Risque faible)

| Tâche | Fichier | Effort | Status |
|-------|---------|--------|--------|
| Créer hook `useLayout` (states layout) | page.tsx | 15 min | [x] |
| Créer hook `useConversation` | page.tsx | 20 min | [ ] |
| Extraire logique filtres | page.tsx | 10 min | [ ] |

**États candidats pour useLayout :**
- `zone1Collapsed`, `zone3Collapsed`
- `zone1Width`, `zone3Width`
- `isResizing`

**États candidats pour useConversation :**
- `messages`, `selectedMessage`
- `currentConversationId`
- `conversations`, `showHistory`
- `loading`, `question`

### Priorité 3 : Tests (Indépendant)

| Tâche | Fichier | Effort | Status |
|-------|---------|--------|--------|
| Tests unitaires api.ts | src/lib/api.test.ts | 30 min | [ ] |
| Tests composants (snapshot) | components/*.test.tsx | 1h | [ ] |

### Priorité 4 : Backend (Optionnel)

| Tâche | Fichier | Effort | Status |
|-------|---------|--------|--------|
| Découper get_semantic_stats | main.py | 20 min | [ ] |
| Ajouter pylint/black | backend/ | 10 min | [ ] |

---

## Évolutions possibles

- [ ] Dockerisation pour déploiement Cloud Run
- [ ] Cache des requêtes fréquentes
- [ ] Export PDF/Excel des rapports
- [ ] Multi-datasources (plusieurs bases)
- [ ] Fine-tuning du prompt selon les erreurs SQL

---

*Architecture conçue pour G7 Taxis - Janvier 2025*
