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

- [ ] Remplacer le fetch par `api.saveReport()`
- [ ] Garder `loadReports()` après
- [ ] Commit: `refactor: handleSaveReport utilise api.ts`

---

### Phase 1C : handleDeleteReport (FAIBLE RISQUE)
**Risque : Faible | Valeur : Moyenne | ~3 lignes**

- [ ] Remplacer le fetch par `api.deleteReport()`
- [ ] Garder `loadReports()` après
- [ ] Commit: `refactor: handleDeleteReport utilise api.ts`

---

### Phase 1D : handleLoadConversation (FAIBLE RISQUE)
**Risque : Faible | Valeur : Moyenne | ~4 lignes**

| Side effects à préserver |
|-------------------------|
| `setCurrentConversationId(conv.id)` |
| `setSelectedMessage(null)` |
| `setShowHistory(false)` |

- [ ] Remplacer le fetch par `api.fetchConversationMessages()`
- [ ] Garder les 3 side effects
- [ ] Commit: `refactor: handleLoadConversation utilise api.ts`

---

### Phase 1E : handleSaveApiKey (FAIBLE RISQUE)
**Risque : Faible | Valeur : Faible | ~4 lignes**

| Side effects à préserver |
|-------------------------|
| `setApiKey("")` |
| `setShowSettings(false)` |
| `checkApiStatus()` → `api.checkApiStatus().then(setApiStatus)` |

- [ ] Remplacer le fetch par `api.saveApiKey()`
- [ ] Garder les 3 side effects
- [ ] Commit: `refactor: handleSaveApiKey utilise api.ts`

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

- [ ] Utiliser `api.createConversation()` pour le fetch
- [ ] Garder TOUS les side effects
- [ ] S'assurer que le `return data.id` fonctionne
- [ ] Commit: `refactor: createNewConversation utilise api.ts`

---

### Phase 2B : handleSubmit (RISQUE MOYEN)
**Risque : Moyen | Valeur : Haute | ~10 lignes**

| Aspect | Comportement actuel |
|--------|-------------------|
| Appel API | `fetch(/conversations/${convId}/analyze)` |
| Gestion erreur | Crée un `errorMessage` local |
| Post-action | `setMessages`, `setSelectedMessage`, `loadConversations` |

- [ ] Utiliser `api.analyzeInConversation()`
- [ ] Adapter le catch pour créer `errorMessage`
- [ ] Garder tous les side effects
- [ ] Commit: `refactor: handleSubmit utilise api.ts`

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

- [ ] Créer endpoint `GET /stats/global` dans backend
- [ ] Ajouter type `GlobalStats` dans types/index.ts
- [ ] Ajouter `fetchGlobalStats()` dans api.ts
- [ ] Passer les KPIs en props à VisualizationZone
- [ ] Commit: `feat: KPIs dynamiques depuis API`

---

## Évolutions possibles

- [ ] Dockerisation pour déploiement Cloud Run
- [ ] Cache des requêtes fréquentes
- [ ] Export PDF/Excel des rapports
- [ ] Multi-datasources (plusieurs bases)
- [ ] Fine-tuning du prompt selon les erreurs SQL

---

*Architecture conçue pour G7 Taxis - Janvier 2025*
