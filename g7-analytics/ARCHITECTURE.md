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

## Évolutions possibles

- [ ] Dockerisation pour déploiement Cloud Run
- [ ] Cache des requêtes fréquentes
- [ ] Export PDF/Excel des rapports
- [ ] Multi-datasources (plusieurs bases)
- [ ] Fine-tuning du prompt selon les erreurs SQL

---

*Architecture conçue pour G7 Taxis - Janvier 2025*
