# Pipeline Airbyte: PostgreSQL RDS → DuckDB

## Architecture du Pipeline

```
┌────────────────────────────────────────────────────────────────────┐
│  PIPELINE COMPLET                                                  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1. PostgreSQL RDS (Production)                                   │
│     ├─ Tables: evaluations, chauffeurs, courses, etc.             │
│     └─ Données opérationnelles live                               │
│                                                                    │
│                         ↓                                          │
│                    [Airbyte CDC]                                   │
│                  Logical Replication                               │
│                  Latence: ~1 seconde                               │
│                         ↓                                          │
│                                                                    │
│  2. DuckDB (g7_analytics.duckdb)                                   │
│     ├─ Réplique des tables PostgreSQL                             │
│     ├─ Stockage columnar optimisé pour analytique                 │
│     └─ Requêtes OLAP rapides                                       │
│                                                                    │
│                         ↓                                          │
│          [G7 Application /catalog/extract]                         │
│            Extraction des métadonnées uniquement                   │
│                         ↓                                          │
│                                                                    │
│  3. SQLite Catalog (catalog.sqlite)                                │
│     ├─ Tables: datasources, tables, columns                        │
│     ├─ Métadonnées: types, descriptions, stats                     │
│     └─ Enrichissement LLM                                          │
│                                                                    │
│                         ↓                                          │
│          [G7 Application /catalog/enrich]                          │
│              LLM génère descriptions + KPIs                        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Prérequis PostgreSQL RDS

### 1. Activer la réplication logique

Dans AWS Console RDS:
```bash
# Créer un parameter group personnalisé
RDS > Parameter Groups > Create parameter group

# Paramètres requis:
rds.logical_replication = 1
wal_level = logical
max_replication_slots = 5
max_wal_senders = 5
```

### 2. Appliquer et redémarrer

1. Associer le parameter group à l'instance RDS
2. Redémarrer l'instance (downtime ~2-5 min)
3. Vérifier: `SHOW wal_level;` doit retourner `logical`

### 3. Créer l'utilisateur de réplication

```sql
-- Connexion à PostgreSQL via psql ou DBeaver
CREATE USER airbyte_user WITH REPLICATION PASSWORD 'your_secure_password';

-- Permissions sur les tables
GRANT USAGE ON SCHEMA public TO airbyte_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO airbyte_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO airbyte_user;

-- Créer la publication (pour CDC)
CREATE PUBLICATION airbyte_publication FOR ALL TABLES;

-- Vérifier
SELECT * FROM pg_publication;
SELECT * FROM pg_replication_slots;
```

## Configuration Airbyte

### Source: PostgreSQL

```yaml
Connector: PostgreSQL
Connection Type: Standard

Host: your-db.eu-west-3.rds.amazonaws.com
Port: 5432
Database: production_db
Username: airbyte_user
Password: ****

SSL Mode: require

# CDC Configuration
Replication Method: Logical Replication (CDC)
Publication: airbyte_publication
Replication Slot Name: airbyte_slot_g7

# Schemas
Schemas: public

# Tables à synchroniser
Tables:
  - evaluations
  - chauffeurs
  - courses
  - clients
  # ... autres tables business
```

### Destination: DuckDB

```yaml
Connector: DuckDB (Community Connector)
Destination Type: Local

# Chemin vers le fichier DuckDB
Destination Path: /path/to/datalakeG7/data/g7_analytics.duckdb
Schema: main

# Options DuckDB
Threads: 4
Memory Limit: 2GB
```

**IMPORTANT**: Le chemin doit correspondre à celui configuré dans [catalog_engine.py:135](catalog_engine.py:135):
```python
DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "g7_analytics.duckdb")
```

### Configuration de la Sync

```yaml
# Mode de synchronisation
Sync Mode: Incremental | Append + Deduped
Cursor Field: updated_at (ou autre timestamp)
Primary Key: id

# Fréquence
Sync Frequency: Continuous (CDC real-time)
# OU si pas CDC disponible:
Sync Frequency: Every 5 minutes

# Normalization
Normalization: Basic Normalization
```

## Airbyte: Options de déploiement

### Option 1: Docker (Recommandé pour dev/test)

```bash
# Utiliser docker-compose.airbyte.yml existant
cd /Users/sayahfarid/datalakeG7
docker-compose -f docker-compose.airbyte.yml up -d

# Accès interface: http://localhost:8000
# Accès API: http://localhost:8001
```

### Option 2: Airbyte Cloud (Recommandé pour production)

- URL: https://cloud.airbyte.com
- Avantages:
  - Pas de gestion infrastructure
  - Monitoring intégré
  - Logs centralisés
  - Support officiel
- Coût: Gratuit jusqu'à 1M de lignes/mois

### Option 3: Airbyte Self-Hosted (Production on-premise)

```bash
# Installation via Helm (Kubernetes)
helm repo add airbyte https://airbytehq.github.io/helm-charts
helm install airbyte airbyte/airbyte
```

## Workflow complet

### 1. Setup initial Airbyte

```bash
# Démarrer Airbyte
docker-compose -f docker-compose.airbyte.yml up -d

# Accéder à l'interface
open http://localhost:8000

# Configurer:
# 1. Source PostgreSQL (avec CDC)
# 2. Destination DuckDB
# 3. Connection avec tables sélectionnées
# 4. Lancer la première sync (full refresh)
```

### 2. Première synchronisation

Airbyte va:
1. Copier toutes les données existantes (full snapshot)
2. Créer le replication slot PostgreSQL
3. Passer en mode CDC (changements incrémentaux)

Durée estimée:
- 10k lignes: ~1 minute
- 100k lignes: ~5 minutes
- 1M lignes: ~20 minutes

### 3. Extraction dans G7 Application

Une fois DuckDB synchronisé, lancer l'extraction:

```bash
# L'application G7 lit depuis data/g7_analytics.duckdb
curl -X POST http://localhost:8000/catalog/extract

# Vérifier les tables extraites
curl http://localhost:8000/catalog/tables
```

### 4. Enrichissement LLM

```bash
# Enrichir les métadonnées avec Gemini
curl -X POST http://localhost:8000/catalog/enrich
```

## Monitoring

### Vérifier l'état du replication slot PostgreSQL

```sql
SELECT
    slot_name,
    plugin,
    slot_type,
    restart_lsn,
    confirmed_flush_lsn,
    pg_current_wal_lsn() - confirmed_flush_lsn AS replication_lag_bytes,
    CASE
        WHEN pg_current_wal_lsn() - confirmed_flush_lsn > 1000000000 THEN 'CRITICAL'
        WHEN pg_current_wal_lsn() - confirmed_flush_lsn > 100000000 THEN 'WARNING'
        ELSE 'OK'
    END as status
FROM pg_replication_slots
WHERE slot_name = 'airbyte_slot_g7';
```

### Vérifier la taille DuckDB

```sql
-- Dans DuckDB
SELECT
    table_name,
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size(table_name::regclass)) as size
FROM information_schema.tables
WHERE table_schema = 'main'
GROUP BY table_name
ORDER BY row_count DESC;
```

### Logs Airbyte

```bash
# Logs temps réel
docker-compose -f docker-compose.airbyte.yml logs -f airbyte-worker

# Logs d'une sync spécifique
# → Interface web: Connections > [Votre connection] > Job History
```

## Troubleshooting

### Erreur: "replication slot already exists"

```sql
-- Supprimer l'ancien slot
SELECT pg_drop_replication_slot('airbyte_slot_g7');

-- Recréer via Airbyte (reset connection)
```

### Erreur: "too many replication slots"

```sql
-- Augmenter la limite dans parameter group
max_replication_slots = 10

-- Redémarrer RDS
```

### DuckDB: "database is locked"

Le fichier DuckDB ne peut être ouvert qu'en écriture par UN processus à la fois.

Solutions:
1. Arrêter l'application G7 pendant la sync Airbyte
2. Utiliser un fichier DuckDB temporaire pour Airbyte, puis merger
3. Configurer Airbyte avec un schedule (ex: toutes les heures)

### Performance lente sur PostgreSQL

Si l'extraction CDC impacte les performances:

```sql
-- Créer des index sur les colonnes de réplication
CREATE INDEX idx_evaluations_updated_at ON evaluations(updated_at);

-- Réduire le WAL retention si trop élevé
SELECT pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn());
```

## Coûts

| Composant | Coût |
|-----------|------|
| Airbyte Cloud | Gratuit jusqu'à 1M lignes/mois, puis $15/10M lignes |
| Airbyte Self-Hosted | Gratuit (open source) |
| PostgreSQL RDS | Inchangé (+5-10% CPU pour CDC) |
| DuckDB | Gratuit (stockage local) |
| Storage WAL RDS | ~$0.10/GB/mois |

## Latence attendue

- **Mode CDC**: < 1 seconde
- **Mode Incremental (sans CDC)**: 5-15 minutes (selon schedule)
- **Impact CPU RDS**: +5-10%
- **Stockage WAL**: ~100MB/jour (dépend du volume d'écritures)

## Alternative: Scripts Python (sans Airbyte)

Si vous ne voulez pas déployer Airbyte, vous pouvez créer un script Python simple:

```python
import psycopg2
import duckdb

# Connexion PostgreSQL
pg_conn = psycopg2.connect(
    host="your-db.eu-west-3.rds.amazonaws.com",
    database="production_db",
    user="airbyte_user",
    password="****"
)

# Connexion DuckDB
duck_conn = duckdb.connect("data/g7_analytics.duckdb")

# Copier une table
tables = ["evaluations", "chauffeurs", "courses"]
for table in tables:
    df = pd.read_sql(f"SELECT * FROM {table}", pg_conn)
    duck_conn.execute(f"CREATE OR REPLACE TABLE {table} AS SELECT * FROM df")

pg_conn.close()
duck_conn.close()
```

Mais cela nécessite:
- Cron job pour exécution régulière
- Gestion manuelle des incréments
- Pas de monitoring intégré
- Pas de CDC temps réel

**Recommandation**: Utilisez Airbyte pour la robustesse et les fonctionnalités avancées.
