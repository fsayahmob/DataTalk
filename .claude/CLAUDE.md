# Projet G7 - Analyse Sémantique des Commentaires Clients

## Contexte
- **Client**: Taxis G7
- **Fichier**: Liste_evaluations_2024_05_filtre.xlsx
- **Volume**: 64 383 évaluations dont 7 255 avec commentaires (mai 2024)
- **Objectif**: Segmenter les commentaires par catégorie de service et analyser le sentiment

## Stack Technique Choisie

```
┌─────────────────────────────────────────────────────────────────┐
│  ARCHITECTURE                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  Excel   │───▶│  Gemini  │───▶│  DuckDB  │───▶│ Wren AI  │  │
│  │  brut    │    │  Flash   │    │  (OLAP)  │    │  (Chat)  │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                                                                 │
│  Enrichissement     Classification    Stockage     Interface    │
│  données            + Sentiment       données      conversationnelle │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Composants

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| **LLM Classification** | Gemini 2.0 Flash | Classifier commentaires + sentiment (~0.20€) |
| **LLM Local (optionnel)** | Ollama + Mistral | Pour Wren AI (gratuit, privé) |
| **Base de données** | DuckDB | Stockage données enrichies (optimisé analytique) |
| **Vector Store** | Qdrant (via Wren AI) | Embeddings pour RAG |
| **Interface** | Wren AI | Chat conversationnel + graphiques Plotly |
| **Déploiement** | Docker | Wren AI stack |

---

## Pipeline du Projet

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: PRÉPARATION DES DONNÉES                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1.1 Nettoyage du fichier Excel                                 │
│      → Remplacer |EµR| par €                                    │
│      → Supprimer caractères spéciaux                            │
│      → Filtrer commentaires vides/trop courts (<5 mots)         │
│                                                                 │
│  1.2 Extraction des commentaires exploitables                   │
│      → 7 255 commentaires non vides                             │
│      → Conserver les métadonnées (note, typ_client, etc.)       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 2: DÉCOUVERTE DE LA TAXONOMIE (dynamique)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  2.1 Échantillonnage stratifié                                  │
│      → ~500 commentaires (mix notes 1-5)                        │
│      → Représentatif des segments clients                       │
│                                                                 │
│  2.2 Topic modeling / Analyse LLM                               │
│      → Identifier les thèmes qui émergent naturellement         │
│      → Option A: BERTopic (local, gratuit)                      │
│      → Option B: Gemini (rapide, ~0.02€)                        │
│                                                                 │
│  2.3 Consolidation de la taxonomie                              │
│      → Regrouper les thèmes similaires                          │
│      → Valider avec le client G7                                │
│      → Finaliser les catégories (8-12 max)                      │
│                                                                 │
│  Catégories potentielles identifiées:                           │
│      • PRIX_FACTURATION (écarts compteur, forfaits)             │
│      • CHAUFFEUR_COMPORTEMENT (politesse, attitude)             │
│      • CHAUFFEUR_CONDUITE (sécurité, vitesse)                   │
│      • VEHICULE_PROPRETE (odeur, saleté)                        │
│      • VEHICULE_CONFORT (clim, espace)                          │
│      • PONCTUALITE (attente, retard)                            │
│      • TRAJET_ITINERAIRE (GPS, détours)                         │
│      • APPLICATION (bugs, paiement, réservation)                │
│      • SERVICE_CLIENT (réclamation, contact)                    │
│      • ACCESSIBILITE (PMR, bagages, langue)                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 3: CLASSIFICATION & SENTIMENT (Gemini 2.0 Flash)         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  3.1 Construire le prompt de classification                     │
│      → Taxonomie validée en phase 2                             │
│      → Multi-label (1 commentaire = N catégories)               │
│      → Sentiment par catégorie [-1 à +1]                        │
│                                                                 │
│  3.2 Traitement par batch                                       │
│      → 20 commentaires par requête                              │
│      → ~363 requêtes API                                        │
│      → Coût estimé: ~0.20€ avec Gemini 2.0 Flash                │
│                                                                 │
│  3.3 Parsing & validation des résultats                         │
│      → Vérifier format JSON retourné                            │
│      → Gérer les erreurs / retry                                │
│                                                                 │
├───────────────────────────────��─────────────────────────────────┤
│  PHASE 4: ENRICHISSEMENT & STOCKAGE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  4.1 Ajouter colonnes au fichier original                       │
│      → categories (liste)                                       │
│      → sentiment_global                                         │
│      → sentiment_par_categorie (JSON)                           │
│      → verbatim_cle (extrait pertinent)                         │
│                                                                 │
│  4.2 Export Excel enrichi                                       │
│      → Liste_evaluations_2024_05_ANALYSE.xlsx                   │
│                                                                 │
│  4.3 Chargement dans DuckDB                                     │
│      → Base analytique optimisée pour agrégations               │
│      → Fichier unique: g7_analytics.duckdb                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 5: INTERFACE WREN AI (Chat + Graphiques)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  5.1 Installation Wren AI                                       │
│      → Docker Compose (Wren UI + Wren Engine + Qdrant)          │
│      → Configuration LLM (Ollama local ou API cloud)            │
│                                                                 │
│  5.2 Configuration du modèle sémantique (MDL)                   │
│      → Définir les tables et relations                          │
│      → Mapper les termes métier G7                              │
│      → Configurer les métriques calculées                       │
│                                                                 │
│  5.3 Interface conversationnelle                                │
│      → Chat en langage naturel                                  │
│      → Génération SQL automatique                               │
│      → Graphiques Plotly interactifs                            │
│      → Export des résultats                                     │
│                                                                 │
│  Exemples de questions possibles:                               │
│      💬 "Quel chauffeur a le plus de commentaires négatifs ?"   │
│      💬 "Quels segments clients se plaignent du prix ?"         │
│      💬 "Évolution du sentiment par mois"                       │
│      💬 "Top 10 verbatims négatifs sur le véhicule"             │
│      💬 "Heatmap catégorie vs type de service"                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 6: LIVRABLES                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  6.1 Fichier Excel enrichi                                      │
│      → Données brutes + colonnes analyse                        │
│                                                                 │
│  6.2 Dashboard Wren AI                                          │
│      → Interface conversationnelle déployée                     │
│      → Accès via URL (local ou cloud)                           │
│                                                                 │
│  6.3 Rapport d'analyse (optionnel)                              │
│      → Synthèse des insights                                    │
│      → Top irritants par segment                                │
│      → Recommandations actionnables                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Structure des Données

### Fichier source
| Colonne | Type | Description |
|---------|------|-------------|
| cod_taxi | float | ID du chauffeur |
| dat_course | datetime | Date de la course |
| note_eval | float | Note globale (1-5) |
| note_commande | float | Note réservation |
| note_vehicule | float | Note véhicule |
| note_chauffeur | float | Note chauffeur |
| commentaire | string | Texte libre client |
| typ_client | string | Type client (36 valeurs) |
| lib_categorie | string | Catégorie client (8 valeurs) |
| typ_chauffeur | string | Type service (3 valeurs) |

### Colonnes ajoutées après enrichissement
| Colonne | Type | Description |
|---------|------|-------------|
| categories | list | Catégories détectées |
| sentiment_global | float | Score sentiment [-1, +1] |
| sentiment_par_categorie | JSON | Sentiment par catégorie |
| verbatim_cle | string | Extrait pertinent |

---

## Commandes utiles

### Installation Wren AI
```bash
# Cloner et lancer Wren AI
git clone https://github.com/Canner/WrenAI.git
cd WrenAI
docker-compose up -d

# Accès interface: http://localhost:3000
```

### Installation Ollama (LLM local)
```bash
# macOS
brew install ollama
ollama pull mistral

# Vérifier
ollama run mistral "Test"
```

### Lancer l'enrichissement
```bash
python scripts/enrich_comments.py
```

---

## Coûts estimés

| Composant | Coût |
|-----------|------|
| Gemini 2.0 Flash (classification) | ~0.20€ |
| Wren AI | Gratuit (open source) |
| Ollama | Gratuit (local) |
| **Total** | **~0.20€** |

---

## Ressources

- [Wren AI Documentation](https://docs.getwren.ai/)
- [Wren AI GitHub](https://github.com/Canner/WrenAI)
- [Wren AI Demo](https://demo.getwren.ai/)
- [Gemini API](https://ai.google.dev/)
- [Ollama](https://ollama.ai/)

---

## BACKLOG - Interface G7 Analytics (Custom)

### Architecture Actuelle
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STACK CUSTOM (plus simple que Wren AI)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  Next.js    │───▶│  FastAPI    │───▶│  Gemini     │───▶│  DuckDB     │  │
│  │  + Shadcn   │    │  Backend    │    │  2.0 Flash  │    │  (OLAP)     │  │
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

### Schéma SQLite (catalog.sqlite)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CATALOGUE SÉMANTIQUE                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  datasources ──1:N──▶ tables ──1:N──▶ columns ──1:N──▶ synonyms            │
│                                              │                              │
│                                              └──────▶ relationships         │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  INTERFACE UTILISATEUR                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  conversations ──1:N──▶ messages                                            │
│       │                    │                                                │
│       │                    ├── role (user/assistant)                        │
│       │                    ├── content                                      │
│       │                    ├── sql_query                                    │
│       │                    ├── chart_config (JSON)                          │
│       │                    ├── model_name                                   │
│       │                    ├── tokens_input                                 │
│       │                    ├── tokens_output                                │
│       │                    └── response_time_ms                             │
│       │                                                                     │
│       └──────────────────▶ saved_reports (favoris)                          │
│                                 ├── title                                   │
│                                 ├── question                                │
│                                 ├── sql_query                               │
│                                 ├── is_pinned                               │
│                                 └── deletable: OUI                          │
│                                                                             │
│  predefined_questions ──────▶ Questions cliquables                          │
│       ├── question                                                          │
│       ├── category (Satisfaction, Performance, Tendances, Exploration)      │
│       ├── icon                                                              │
│       └── display_order                                                     │
│                                                                             │
│  settings ──────────────────▶ Configuration                                 │
│       ├── gemini_api_key                                                    │
│       ├── model_name                                                        │
│       └── other preferences                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### User Stories - Sprint Interface

#### US-01: Layout 3 Panneaux
- [ ] Zone 1 (30%): Chat conversation avec historique
- [ ] Zone 2 (50%): Visualisation (graphique + tableau)
- [ ] Zone 3 (20%): Menu rapports sauvegardés

#### US-02: Conversation Chat
- [ ] Afficher questions user + réponses assistant empilées
- [ ] Animation 3 points pendant le chargement
- [ ] Bouton "Relancer" sur chaque message
- [ ] Métadonnées par réponse:
  - [ ] Modèle utilisé (ex: gemini-2.0-flash)
  - [ ] Tokens input/output
  - [ ] Temps de réponse (ms)

#### US-03: Questions Prédéfinies
- [ ] Afficher dans la conversation comme suggestions cliquables
- [ ] Catégorisées (Satisfaction, Performance, Tendances, Exploration)
- [ ] Stockées dans SQLite (table: predefined_questions)
- [ ] Seeder avec ~12 questions de départ

#### US-04: Rapports Sauvegardés
- [ ] Bouton "Sauvegarder" sur chaque visualisation
- [ ] Liste dans Zone 3 avec titre cliquable
- [ ] Épingler/désépingler un rapport
- [ ] Supprimer un rapport (confirmation)
- [ ] Clic = relance la requête

#### US-05: Menu Configuration (Rétractable)
- [ ] Icône engrenage dans le header
- [ ] Panel rétractable (slide from right)
- [ ] Configurer clé API Gemini
- [ ] Sélectionner le modèle (gemini-2.0-flash, gemini-1.5-pro, etc.)
- [ ] Afficher statut connexion

#### US-06: Endpoints FastAPI
- [ ] POST /conversations - Créer conversation
- [ ] GET /conversations - Lister conversations
- [ ] DELETE /conversations/{id} - Supprimer conversation
- [ ] GET /conversations/{id}/messages - Messages d'une conversation
- [ ] POST /reports - Sauvegarder rapport
- [ ] GET /reports - Lister rapports
- [ ] DELETE /reports/{id} - Supprimer rapport
- [ ] PATCH /reports/{id}/pin - Toggle épinglé
- [ ] GET /questions/predefined - Questions prédéfinies
- [ ] GET /settings - Récupérer config
- [ ] PUT /settings - Modifier config

#### US-07: Indicateurs de Performance
- [ ] Afficher modèle dans le header
- [ ] Badge tokens sur chaque réponse
- [ ] Temps de réponse formaté (ex: "1.2s")
- [ ] Statut API Gemini (vert/rouge)

### Questions Prédéfinies (à seeder)

| Catégorie | Question | Icône |
|-----------|----------|-------|
| Satisfaction | Quelle est la note moyenne globale ? | ⭐ |
| Satisfaction | Répartition des notes de 1 à 5 | ⭐ |
| Satisfaction | Quels types de clients sont les plus satisfaits ? | ⭐ |
| Performance | Top 10 chauffeurs les mieux notés | 🏆 |
| Performance | Chauffeurs avec plus de 50 évaluations | 🏆 |
| Performance | Note moyenne par type de chauffeur (VIP, Standard, Green) | 🏆 |
| Tendances | Évolution des notes par jour | 📈 |
| Tendances | Heures de la journée avec les meilleures notes | 📈 |
| Tendances | Comparaison notes semaine vs weekend | 📈 |
| Exploration | Combien de clients ont laissé un commentaire ? | 🔍 |
| Exploration | Répartition par catégorie client | 🔍 |
| Exploration | Note véhicule vs note chauffeur (corrélation) | 🔍 |

---

### Priorités Sprint 1

1. **Backend FastAPI** - Endpoints conversations + rapports + settings
2. **Seed questions** - Peupler predefined_questions
3. **Layout 3 panneaux** - Structure CSS/Tailwind
4. **Chat conversation** - Historique + animation loading
5. **Menu config** - Panel rétractable Gemini API key


git checkout 66a25ad