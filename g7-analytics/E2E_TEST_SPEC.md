# Spécification des Tests E2E - G7 Analytics

## Architecture de l'Application

```
┌────────────────────────────────────────────────────────────────────────────┐
│  HEADER                                                                    │
│  - Logo G7 + Titre                                                         │
│  - Statut API (vert/rouge/orange)                                          │
│  - Bouton Settings (⚙️)                                                    │
│    └─ Panel Settings (clé API Gemini)                                      │
├──────────────────┬─────────────────────────────┬───────────────────────────┤
│  ZONE 1: CHAT    │  ZONE 2: VISUALISATION      │  ZONE 3: ANALYTICS        │
│  (25% - resize)  │  (flexible)                 │  (20% - resize)           │
│                  │                             │                           │
│  - Header Chat   │  - Header Visualisation     │  - Header Analytics       │
│  - Historique    │  - KPIs globaux (4 cards)   │  - KPIs Sémantiques       │
│  - Messages      │  - Filtres (collapsible)    │  - Distribution Sentiment │
│  - Questions     │  - Graphique                │  - Alertes                │
│  - Input Chat    │  - Tableau données          │  - Points Forts           │
│                  │                             │  - Rapports sauvegardés   │
├──────────────────┴─────────────────────────────┴───────────────────────────┤
│  Resize Handles (drag to resize zones)                                     │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Liste des Éléments Testables

### 1. Header (`Header.tsx`)

| ID | Élément | Action | Résultat Attendu |
|----|---------|--------|------------------|
| H1 | Logo G7 | Affichage | Logo visible avec gradient |
| H2 | Titre | Affichage | "G7 Analytics" + "Text-to-SQL Dashboard" |
| H3 | Statut API | Affichage | Pastille colorée (vert=ok, rouge=error, orange=unknown) |
| H4 | Bouton Settings | Click | Toggle du panel Settings |
| H5 | Panel Settings | Visible quand ouvert | Input clé API + bouton Sauvegarder |
| H6 | Input Clé API | Saisie | Accepte texte, type=password |
| H7 | Bouton Sauvegarder | Click (avec clé) | Appel API, ferme panel, refresh statut |
| H8 | Bouton Sauvegarder | Disabled si vide | Bouton grisé si input vide |

### 2. Zone Chat (`ChatZone.tsx`)

| ID | Élément | Action | Résultat Attendu |
|----|---------|--------|------------------|
| C1 | Bouton Collapse | Click | Zone réduite à 14px, icône chat affichée |
| C2 | Bouton Expand | Click (quand collapsed) | Zone restaurée à sa largeur |
| C3 | Bouton Historique | Click | Toggle dropdown historique conversations |
| C4 | Bouton Nouvelle Conv | Click | Reset messages, currentConversationId=null |
| C5 | Liste Historique | Affichage | Max 15 conversations, triées par date |
| C6 | Item Historique | Click | Charge les messages de cette conversation |
| C7 | Questions Prédéfinies | Affichage (si 0 messages) | Groupées par catégorie (Satisfaction, Performance, etc.) |
| C8 | Question Prédéfinie | Click | Question copiée dans textarea |
| C9 | Textarea Question | Saisie | Texte visible, placeholder actif |
| C10 | Textarea Question | Enter (sans Shift) | Submit formulaire |
| C11 | Textarea Question | Shift+Enter | Nouvelle ligne |
| C12 | Bouton Send | Click (avec texte) | Envoie la question |
| C13 | Bouton Send | Disabled si vide | Bouton grisé |
| C14 | Bouton Send | Pendant loading | Affiche icône Stop |
| C15 | Message User | Affichage | Style distinct (bg-primary/20, aligné droite) |
| C16 | Message Assistant | Affichage | Style distinct (bg-secondary/30) |
| C17 | Message Assistant | Click | Sélectionne le message (ring-1) |
| C18 | Message User - Relancer | Click | Question copiée dans textarea |
| C19 | Métadonnées Message | Affichage | Temps réponse, tokens (si assistant) |
| C20 | Loading Animation | Pendant requête | 3 points animés + "Analyse en cours" |
| C21 | Auto-scroll | Nouveau message | Scroll vers le bas |

### 3. Zone Visualisation (`VisualizationZone.tsx`)

| ID | Élément | Action | Résultat Attendu |
|----|---------|--------|------------------|
| V1 | Header | Affichage | Titre "Visualisation", métadonnées si message sélectionné |
| V2 | Bouton Sauvegarder | Click (si message avec SQL) | Ouvre prompt titre, sauvegarde rapport |
| V3 | Bouton Sauvegarder | Hidden si pas de SQL | Bouton non visible |
| V4 | KPI Évaluations | Affichage | Nombre total formaté (séparateur milliers) |
| V5 | KPI Note moyenne | Affichage | Note avec 2 décimales |
| V6 | KPI Commentaires | Affichage | Nombre total formaté |
| V7 | KPI Chauffeurs | Affichage | Nombre total formaté |
| V8 | Bouton Filtres | Click | Toggle panel filtres |
| V9 | Badge Filtres | Affichage | Compte des filtres actifs |
| V10 | Filtre Date Début | Saisie | Input type=date |
| V11 | Filtre Date Fin | Saisie | Input type=date |
| V12 | Filtre Note Min | Select | Options 1-5 étoiles |
| V13 | Filtre Note Max | Select | Options 1-5 étoiles |
| V14 | Bouton Réinitialiser | Click | Tous filtres vidés |
| V15 | Graphique | Affichage (si chart config) | Recharts rend le bon type (bar, line, pie, area, scatter) |
| V16 | Graphique Multi-series | Affichage | Plusieurs courbes avec couleurs distinctes |
| V17 | Header Données | Affichage | Compte lignes, bouton Copier SQL |
| V18 | Bouton Copier SQL | Click | SQL copié dans clipboard |
| V19 | Tableau Données | Affichage | Colonnes dynamiques selon data |
| V20 | Tableau - Tri | Click header colonne | Tri ascendant/descendant |
| V21 | État Vide | Affichage (pas de message) | Message "Posez une question..." |

### 4. Zone Analytics (`AnalyticsZone.tsx`)

| ID | Élément | Action | Résultat Attendu |
|----|---------|--------|------------------|
| A1 | Bouton Collapse | Click | Zone réduite à 14px |
| A2 | Bouton Expand | Click (quand collapsed) | Zone restaurée |
| A3 | KPI Sentiment | Affichage | Score formaté, couleur selon +/- |
| A4 | KPI Taux Enrichi | Affichage | Pourcentage |
| A5 | Distribution Sentiments | Affichage | 5 barres (Très positif → Très négatif) |
| A6 | Tooltips Info | Hover sur "i" | Tooltip explicatif visible |
| A7 | Section Alertes | Affichage (si données) | Liste catégories négatives |
| A8 | Section Points Forts | Affichage (si données) | Liste catégories positives |
| A9 | Liste Rapports | Affichage | Max 5 rapports, triés |
| A10 | Rapport Item | Click | Exécute SQL du rapport, affiche résultat |
| A11 | Rapport - Supprimer | Click | Confirmation, puis suppression |
| A12 | Badge Pinned | Affichage | Point coloré si rapport épinglé |
| A13 | État Vide Rapports | Affichage | "Aucun rapport" |

### 5. Layout & Resize (`useLayout.ts`)

| ID | Élément | Action | Résultat Attendu |
|----|---------|--------|------------------|
| L1 | Resize Handle Zone 1 | Drag | Zone 1 redimensionnée (15-50%) |
| L2 | Resize Handle Zone 3 | Drag | Zone 3 redimensionnée (10-35%) |
| L3 | Cursor pendant resize | Drag | cursor: col-resize |
| L4 | User-select pendant resize | Drag | user-select: none |

---

## Scénarios de Test E2E

### Scénario 1: Premier chargement

```gherkin
Feature: Premier chargement de l'application

  Scenario: L'utilisateur arrive sur l'application
    Given l'application est démarrée
    When la page se charge
    Then le header est visible avec le logo G7
    And le statut API est affiché (vert, rouge ou orange)
    And la zone Chat affiche les questions prédéfinies
    And la zone Visualisation affiche les KPIs globaux
    And la zone Analytics affiche les statistiques sémantiques
```

### Scénario 2: Poser une question

```gherkin
Feature: Chat conversationnel

  Scenario: Poser une question en langage naturel
    Given l'application est chargée
    When je tape "Quelle est la note moyenne ?" dans le textarea
    And je clique sur le bouton Send
    Then un message user apparaît avec ma question
    And l'animation loading s'affiche
    And après réponse, un message assistant apparaît
    And le message assistant contient SQL et données
    And le graphique s'affiche dans la zone Visualisation
    And le tableau de données s'affiche

  Scenario: Utiliser une question prédéfinie
    Given l'application est chargée avec 0 messages
    When je clique sur "Quelle est la note moyenne globale ?"
    Then le textarea contient la question

  Scenario: Relancer une question
    Given j'ai posé une question
    When je clique sur "Relancer" sur un message user
    Then le textarea contient la question originale
```

### Scénario 3: Navigation dans l'historique

```gherkin
Feature: Historique des conversations

  Scenario: Charger une ancienne conversation
    Given j'ai des conversations sauvegardées
    When je clique sur le bouton Historique
    Then la liste des conversations s'affiche
    When je clique sur une conversation
    Then les messages de cette conversation s'affichent
    And la conversation est marquée comme active

  Scenario: Nouvelle conversation
    Given je suis dans une conversation existante
    When je clique sur "Nouvelle conversation"
    Then les messages sont vidés
    And les questions prédéfinies s'affichent
```

### Scénario 4: Filtres

```gherkin
Feature: Filtres sur les données

  Scenario: Appliquer des filtres à une question
    Given l'application est chargée
    When je clique sur "Filtres"
    Then le panel de filtres s'affiche
    When je sélectionne une date de début
    And je pose une question
    Then la question inclut le contexte du filtre
    And les résultats sont filtrés

  Scenario: Réinitialiser les filtres
    Given j'ai des filtres actifs
    When je clique sur "Réinitialiser"
    Then tous les filtres sont vidés
    And le badge de comptage disparaît
```

### Scénario 5: Rapports sauvegardés

```gherkin
Feature: Gestion des rapports

  Scenario: Sauvegarder un rapport
    Given j'ai une visualisation avec SQL
    When je clique sur "Sauvegarder"
    Then un prompt demande le titre
    When je saisis un titre et valide
    Then le rapport apparaît dans la liste

  Scenario: Exécuter un rapport sauvegardé
    Given j'ai des rapports sauvegardés
    When je clique sur un rapport
    Then le SQL est exécuté
    And la visualisation s'affiche

  Scenario: Supprimer un rapport
    Given j'ai des rapports sauvegardés
    When je clique sur "Supprimer" sur un rapport
    Then une confirmation s'affiche
    When je confirme
    Then le rapport est supprimé de la liste
```

### Scénario 6: Configuration API

```gherkin
Feature: Configuration

  Scenario: Configurer la clé API
    Given l'application est chargée
    When je clique sur le bouton Settings
    Then le panel de configuration s'affiche
    When je saisis une clé API
    And je clique sur "Sauvegarder"
    Then le panel se ferme
    And le statut API se met à jour
```

### Scénario 7: Redimensionnement des zones

```gherkin
Feature: Layout responsive

  Scenario: Redimensionner la zone Chat
    Given l'application est chargée
    When je drag le resize handle de la zone 1
    Then la largeur de la zone Chat change
    And la zone Visualisation s'adapte

  Scenario: Collapse/Expand des zones
    Given l'application est chargée
    When je clique sur le bouton collapse de la zone Chat
    Then la zone Chat est réduite à une icône
    When je clique sur l'icône
    Then la zone Chat est restaurée
```

---

## Assertions de Données

### API Responses à mocker/vérifier

| Endpoint | Méthode | Response attendue |
|----------|---------|-------------------|
| `/api/questions/predefined` | GET | Array de questions groupées |
| `/api/conversations` | GET | Array de conversations |
| `/api/conversations/{id}/messages` | GET | Array de messages |
| `/api/conversations` | POST | {id: number} |
| `/api/analyze` | POST | {message, sql, chart, data, ...} |
| `/api/reports` | GET | Array de rapports |
| `/api/reports` | POST | {id: number} |
| `/api/reports/{id}` | DELETE | 204 |
| `/api/reports/{id}/execute` | GET | {title, sql, chart, data} |
| `/api/stats/global` | GET | {total_evaluations, note_moyenne, ...} |
| `/api/stats/semantic` | GET | {global, sentiment_distribution, ...} |
| `/api/settings/gemini/status` | GET | "ok" | "error" |
| `/api/settings/gemini` | PUT | 204 |

---

## Structure des Tests

```
g7-analytics/
├── e2e/
│   ├── fixtures/
│   │   ├── conversations.json
│   │   ├── messages.json
│   │   ├── predefined-questions.json
│   │   ├── reports.json
│   │   └── stats.json
│   ├── tests/
│   │   ├── header.spec.ts
│   │   ├── chat-zone.spec.ts
│   │   ├── visualization-zone.spec.ts
│   │   ├── analytics-zone.spec.ts
│   │   ├── layout.spec.ts
│   │   └── full-flow.spec.ts
│   └── playwright.config.ts
```

---

## Priorités d'Implémentation

1. **P0 - Critique**: Chat flow complet (C9→C12→C15→C16→V15→V19)
2. **P1 - Important**: Rapports (V2, A10, A11)
3. **P2 - Standard**: Filtres (V8-V14)
4. **P3 - Nice-to-have**: Layout resize (L1-L4)
