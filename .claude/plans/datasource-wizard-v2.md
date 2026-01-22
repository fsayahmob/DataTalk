# Conception Détaillée : Wizard Datasource v2

## 1. Vue d'ensemble

### 1.1 Objectif
Permettre à l'utilisateur de créer une datasource avec sélection fine des tables à synchroniser, détection intelligente des dépendances FK, et choix du mode de synchronisation.

### 1.2 Workflow en 5 étapes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ① ──────── ② ──────── ③ ──────── ④ ──────── ⑤                           │
│   Connecteur  Connexion   Tables     Mode       Finalisation                │
│                                                                             │
│   Sélection   Config +    Sélection  Full/      Nom + Résumé               │
│   du type     Test        tables     Incrémental + Création                 │
│                           + FK check                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Composants UI à créer/modifier

### 2.1 Nouveaux composants
| Composant | Fichier | Description |
|-----------|---------|-------------|
| `Checkbox` | `components/ui/checkbox.tsx` | Radix checkbox avec indeterminate |
| `TableSelector` | `components/datasets/TableSelector.tsx` | Accordion + checkboxes + filtres |
| `FKWarningDialog` | `components/datasets/FKWarningDialog.tsx` | Modal alerte FK manquantes |
| `SyncModeSelector` | `components/datasets/SyncModeSelector.tsx` | Radio Full/Incremental |
| `DatasourceDetail` | `components/datasets/DatasourceDetail.tsx` | Vue détail après création |

### 2.2 Modifications existantes
| Fichier | Modifications |
|---------|---------------|
| `CreateDatasourceWizard.tsx` | Ajouter étapes 3 et 4, refactor state |
| `connectors.ts` (API) | Enrichir discover avec FK |
| `native_connectors.py` | Ajouter découverte FK PostgreSQL/MySQL |
| `datasources.py` (catalog) | Ajouter colonne `ingestion_catalog` |

---

## 3. Spécification détaillée par étape

### 3.1 Étape 1 : Sélection du connecteur (existante - pas de changement)

**État actuel :** ✅ Complet

---

### 3.2 Étape 2 : Configuration connexion (existante - pas de changement majeur)

**État actuel :** ✅ Complet

**Modification mineure :**
- Après test réussi, bouton "Suivant" déclenche automatiquement `discoverCatalog()`
- Affiche spinner "Découverte des tables..." pendant le chargement

---

### 3.3 Étape 3 : Sélection des tables (NOUVELLE)

#### 3.3.1 Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Étape 3 sur 5                                    [Précédent] [Suivant →]   │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Sélectionner les tables à synchroniser                                     │
│  Choisissez les tables que vous souhaitez importer dans votre dataset.     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🔍 Rechercher une table...                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Sélection rapide :                                                         │
│  [Tout sélectionner] [Tout désélectionner] [─ Exclure _*] [─ Exclure raw*] │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ▼ public                                              2/4 tables    │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │ ☑ evaluations                                               │   │   │
│  │   │   64,385 lignes • 22 colonnes                    🔗 2 FK    │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │ ☑ evaluation_categories                                     │   │   │
│  │   │   7,763 lignes • 12 colonnes                     🔗 1 FK    │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │ ☐ _airbyte_raw_data                                         │   │   │
│  │   │   12 lignes • 3 colonnes                                    │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │ ☐ _migrations                                               │   │   │
│  │   │   5 lignes • 2 colonnes                                     │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │ ▶ analytics                                           0/2 tables   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  📊 2 tables sélectionnées • ~72,148 lignes estimées                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 3.3.2 Comportements

**Filtrage par recherche :**
- Filtre en temps réel sur le nom de table
- Case-insensitive
- Highlight du texte matché

**Boutons de sélection rapide :**
| Bouton | Action |
|--------|--------|
| Tout sélectionner | `setAllTables(true)` |
| Tout désélectionner | `setAllTables(false)` |
| Exclure _* | `excludeByPrefix("_")` |
| Exclure raw* | `excludeByPrefix("raw")` |

**Accordion par schéma :**
- Groupement par schéma (public, analytics, etc.)
- Header affiche : nom schéma + compteur "X/Y tables"
- Chevron rotation 90° à l'ouverture
- Premier schéma ouvert par défaut

**Ligne de table :**
- Checkbox à gauche
- Nom de table (bold)
- Sous-texte : "X lignes • Y colonnes"
- Badge FK si foreign keys présentes (hover pour détails)

**Validation au clic "Suivant" :**
1. Vérifier qu'au moins 1 table est sélectionnée
2. Analyser les FK manquantes
3. Si FK manquantes → Afficher `FKWarningDialog`

#### 3.3.3 Dialog FK Warning

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ Tables de liaison manquantes                          [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Certaines tables permettent des jointures avec votre          │
│  sélection mais n'ont pas été incluses :                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ☐ users                                                 │   │
│  │   Lié à : evaluations.user_id → users.id               │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ☐ clients                                               │   │
│  │   Lié à : evaluations.client_id → clients.id           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Sans ces tables, certaines analyses croisées seront           │
│  impossibles.                                                   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│            [Continuer sans]  [Ajouter la sélection]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Comportements :**
- Tables manquantes listées avec checkbox (pré-cochées)
- Utilisateur peut décocher celles qu'il ne veut pas
- "Ajouter la sélection" → ajoute les tables cochées et passe à l'étape 4
- "Continuer sans" → passe à l'étape 4 sans modification

---

### 3.4 Étape 4 : Mode de synchronisation (NOUVELLE)

#### 3.4.1 Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Étape 4 sur 5                                    [Précédent] [Suivant →]   │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Mode de synchronisation                                                    │
│  Choisissez comment les données seront mises à jour.                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ◉ Full Refresh (Rafraîchissement complet)                          │   │
│  │                                                                     │   │
│  │   Remplace toutes les données à chaque synchronisation.            │   │
│  │   Recommandé pour les tables de petite/moyenne taille ou les       │   │
│  │   données fréquemment modifiées.                                   │   │
│  │                                                                     │   │
│  │   ✓ Simple et fiable                                               │   │
│  │   ✓ Données toujours à jour                                        │   │
│  │   ⚠ Plus lent pour les grandes tables                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ○ Incremental (Incrémental)                               🔒       │   │
│  │                                                           Bientôt  │   │
│  │   Synchronise uniquement les nouvelles données depuis la           │   │
│  │   dernière exécution.                                              │   │
│  │                                                                     │   │
│  │   ✓ Rapide pour les grandes tables                                 │   │
│  │   ✓ Économise les ressources                                       │   │
│  │   ⚠ Nécessite une colonne de date/cursor                          │   │
│  │                                                                     │   │
│  │   Disponible dans une prochaine version.                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 3.4.2 Comportements

- Radio button selection
- Option "Incremental" désactivée (grisée) avec badge "Bientôt"
- Pas de validation spéciale (Full Refresh pré-sélectionné)

---

### 3.5 Étape 5 : Finalisation (modification de l'existante)

#### 3.5.1 Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Étape 5 sur 5                                    [Précédent] [Créer →]     │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Finaliser la datasource                                                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Nom *                                                               │   │
│  │ ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │ │ G7 Analytics PostgreSQL                                        │ │   │
│  │ └─────────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Description                                                         │   │
│  │ ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │ │ Base de données des évaluations chauffeurs G7                  │ │   │
│  │ └─────────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Résumé                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Connecteur      PostgreSQL                                         │   │
│  │ Serveur         g7-analytics.rds.amazonaws.com:5432                │   │
│  │ Base            g7_analytics                                       │   │
│  │ Tables          2 tables (evaluations, evaluation_categories)      │   │
│  │ Lignes estimées ~72,148                                            │   │
│  │ Mode            Full Refresh                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ☑ Lancer la synchronisation après création                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Modifications Backend

### 4.1 Schéma SQLite - Nouvelles colonnes

```sql
ALTER TABLE datasources ADD COLUMN sync_mode TEXT DEFAULT 'full_refresh'
  CHECK(sync_mode IN ('full_refresh', 'incremental'));

ALTER TABLE datasources ADD COLUMN ingestion_catalog TEXT;  -- JSON
```

### 4.2 Structure ingestion_catalog (JSON)

```json
{
  "discovered_at": "2024-01-21T15:30:00Z",
  "tables": [
    {
      "schema": "public",
      "name": "evaluations",
      "enabled": true,
      "row_count": 64385,
      "columns": [
        {"name": "id", "type": "integer", "nullable": false},
        {"name": "user_id", "type": "integer", "nullable": true},
        {"name": "note_eval", "type": "number", "nullable": true}
      ],
      "primary_key": ["id"],
      "foreign_keys": [
        {
          "column": "user_id",
          "references_table": "public.users",
          "references_column": "id"
        }
      ]
    }
  ]
}
```

### 4.3 API discover - Ajout FK

**Modification de `native_connectors.py` :**

```python
def discover_postgres_catalog(config: dict) -> list[dict]:
    # ... existing code ...

    # NOUVEAU: Récupérer les foreign keys
    cursor.execute("""
        SELECT
            tc.table_schema,
            tc.table_name,
            kcu.column_name,
            ccu.table_schema AS foreign_schema,
            ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
    """)

    # Ajouter FK à chaque stream
    for stream in streams:
        stream["foreign_keys"] = get_fk_for_table(...)
```

### 4.4 API datasources - Nouveaux champs

**Modification de `routes/datasources.py` :**

```python
class CreateDatasourceRequest(BaseModel):
    name: str
    dataset_id: str
    source_type: str
    description: str | None = None
    sync_config: dict | None = None
    sync_mode: str = "full_refresh"  # NOUVEAU
    ingestion_catalog: dict | None = None  # NOUVEAU
```

---

## 5. Modifications Frontend

### 5.1 Types TypeScript

```typescript
// types.ts - Ajouts

interface IngestionTable {
  schema: string;
  name: string;
  enabled: boolean;
  row_count?: number;
  columns: IngestionColumn[];
  primary_key?: string[];
  foreign_keys?: ForeignKey[];
}

interface IngestionColumn {
  name: string;
  type: string;
  nullable: boolean;
}

interface ForeignKey {
  column: string;
  references_table: string;
  references_column: string;
}

interface IngestionCatalog {
  discovered_at: string;
  tables: IngestionTable[];
}

// Mise à jour Datasource
interface Datasource {
  // ... existing fields ...
  sync_mode: "full_refresh" | "incremental";
  ingestion_catalog: IngestionCatalog | null;
}

// Mise à jour CreateDatasourceRequest
interface CreateDatasourceRequest {
  // ... existing fields ...
  sync_mode?: "full_refresh" | "incremental";
  ingestion_catalog?: IngestionCatalog | null;
}
```

### 5.2 État du Wizard

```typescript
// CreateDatasourceWizard.tsx

interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;

  // Step 1
  selectedConnector: Connector | null;

  // Step 2
  connectionConfig: Record<string, unknown> | null;

  // Step 3 (NOUVEAU)
  discoveredTables: IngestionTable[];
  selectedTables: Set<string>;  // "schema.table"

  // Step 4 (NOUVEAU)
  syncMode: "full_refresh" | "incremental";

  // Step 5
  name: string;
  description: string;
  syncAfterCreate: boolean;
}
```

### 5.3 Logique détection FK manquantes

```typescript
function findMissingFKTables(
  allTables: IngestionTable[],
  selectedTableNames: Set<string>
): IngestionTable[] {
  const missing: IngestionTable[] = [];

  for (const table of allTables) {
    const fullName = `${table.schema}.${table.name}`;

    // Skip si déjà sélectionnée
    if (selectedTableNames.has(fullName)) continue;

    // Vérifier si cette table est référencée par une table sélectionnée
    for (const selectedName of selectedTableNames) {
      const selectedTable = allTables.find(
        t => `${t.schema}.${t.name}` === selectedName
      );

      if (selectedTable?.foreign_keys?.some(
        fk => fk.references_table === fullName
      )) {
        missing.push(table);
        break;
      }
    }
  }

  return missing;
}
```

---

## 6. Composant Checkbox Radix

```typescript
// components/ui/checkbox.tsx

"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded border border-primary",
      "ring-offset-background focus-visible:outline-none",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      {props.checked === "indeterminate" ? (
        <Minus className="h-3 w-3" />
      ) : (
        <Check className="h-3 w-3" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
```

---

## 7. Traductions i18n

### 7.1 Frontend (fr.json / en.json)

```json
{
  "datasourceWizard": {
    "step3Title": "Sélectionner les tables",
    "step3Subtitle": "Choisissez les tables à synchroniser dans votre dataset.",
    "searchPlaceholder": "Rechercher une table...",
    "selectAll": "Tout sélectionner",
    "deselectAll": "Tout désélectionner",
    "excludePrefix": "Exclure {prefix}*",
    "tablesSelected": "{count} table(s) sélectionnée(s)",
    "rowsEstimated": "~{count} lignes estimées",
    "columns": "{count} colonnes",
    "rows": "{count} lignes",
    "foreignKeys": "{count} FK",

    "step4Title": "Mode de synchronisation",
    "step4Subtitle": "Choisissez comment les données seront mises à jour.",
    "fullRefresh": "Full Refresh",
    "fullRefreshDesc": "Remplace toutes les données à chaque synchronisation.",
    "incremental": "Incrémental",
    "incrementalDesc": "Synchronise uniquement les nouvelles données.",
    "comingSoon": "Bientôt disponible",

    "step5Title": "Finaliser",
    "summary": "Résumé",
    "connector": "Connecteur",
    "server": "Serveur",
    "database": "Base",
    "tables": "Tables",
    "estimatedRows": "Lignes estimées",
    "mode": "Mode",
    "syncAfterCreate": "Lancer la synchronisation après création",

    "fkWarningTitle": "Tables de liaison manquantes",
    "fkWarningMessage": "Certaines tables permettent des jointures avec votre sélection mais n'ont pas été incluses :",
    "fkWarningHelp": "Sans ces tables, certaines analyses croisées seront impossibles.",
    "linkedTo": "Lié à : {source} → {target}",
    "continueWithout": "Continuer sans",
    "addSelection": "Ajouter la sélection",

    "noTablesSelected": "Sélectionnez au moins une table pour continuer."
  }
}
```

---

## 8. Plan d'implémentation (ordre)

| # | Tâche | Fichier(s) | Dépendances |
|---|-------|------------|-------------|
| 1 | Installer @radix-ui/react-checkbox | package.json | - |
| 2 | Créer composant Checkbox | ui/checkbox.tsx | #1 |
| 3 | Ajouter colonnes SQLite | schema.sql + migration | - |
| 4 | Modifier discover PG avec FK | native_connectors.py | - |
| 5 | Modifier discover MySQL avec FK | native_connectors.py | - |
| 6 | Mettre à jour types TS | types.ts | - |
| 7 | Mettre à jour API datasources | datasources.py, routes | #3 |
| 8 | Créer TableSelector | TableSelector.tsx | #2 |
| 9 | Créer FKWarningDialog | FKWarningDialog.tsx | #8 |
| 10 | Créer SyncModeSelector | SyncModeSelector.tsx | - |
| 11 | Modifier Wizard (steps 3-5) | CreateDatasourceWizard.tsx | #8,9,10 |
| 12 | Modifier sync_service | sync_service.py | #7 |
| 13 | Ajouter traductions | en.json, fr.json | - |
| 14 | Tests manuels | - | #1-13 |

---

## 9. Critères de qualité UX

### 9.1 Performance
- [ ] Découverte catalogue < 3s pour 100 tables
- [ ] Recherche filtre en < 50ms
- [ ] Pas de re-render inutiles (React.memo)

### 9.2 Accessibilité
- [ ] Navigation clavier complète (Tab, Enter, Space)
- [ ] Focus visible sur tous les éléments interactifs
- [ ] Labels ARIA sur checkboxes
- [ ] Contraste suffisant (WCAG AA)

### 9.3 Responsive
- [ ] Modal 90% width sur mobile
- [ ] Accordion single-column sur petit écran
- [ ] Boutons full-width sur mobile

### 9.4 Feedback utilisateur
- [ ] Loading states clairs
- [ ] Messages d'erreur contextuels
- [ ] Confirmation avant actions destructives
- [ ] Toast notifications cohérentes

---

## 10. Edge cases à gérer

| Cas | Comportement |
|-----|--------------|
| 0 tables découvertes | Message "Aucune table trouvée" + bouton retour |
| 500+ tables | Pagination virtuelle ou limite affichage |
| Nom table très long | Truncate avec tooltip |
| Schéma sans tables | Ne pas afficher l'accordion vide |
| Toutes FK circulaires | Pas de warning (impossible à résoudre) |
| Connexion perdue pendant discover | Retry automatique 1x puis erreur |
| Création échoue | Garder état wizard, afficher erreur |
