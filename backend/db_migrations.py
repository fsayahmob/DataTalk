"""
Migrations de base de données atomiques pour PostgreSQL.

Chaque migration est exécutée dans une transaction.
En cas d'échec, le rollback est automatique.
"""

import logging
import uuid
from typing import Any

logger = logging.getLogger(__name__)


class MigrationError(Exception):
    """Erreur lors d'une migration."""


def _column_exists(cursor: Any, table: str, column: str) -> bool:
    """Vérifie si une colonne existe dans une table (PostgreSQL)."""
    cursor.execute("""
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = %s
        AND column_name = %s
    """, (table, column))
    return cursor.fetchone() is not None


def _table_exists(cursor: Any, table: str) -> bool:
    """Vérifie si une table existe (PostgreSQL)."""
    cursor.execute("""
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = %s
    """, (table,))
    return cursor.fetchone() is not None


# =============================================================================
# MIGRATIONS
# =============================================================================


def _migration_001_share_token(cursor: Any) -> None:
    """Ajoute share_token à saved_reports."""
    if not _table_exists(cursor, "saved_reports"):
        return
    if _column_exists(cursor, "saved_reports", "share_token"):
        return

    cursor.execute("ALTER TABLE saved_reports ADD COLUMN share_token TEXT")
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_share_token ON saved_reports(share_token)"
    )
    # Générer des tokens pour les rapports existants
    cursor.execute("SELECT id FROM saved_reports WHERE share_token IS NULL")
    for row in cursor.fetchall():
        cursor.execute(
            "UPDATE saved_reports SET share_token = %s WHERE id = %s",
            (str(uuid.uuid4()), row["id"]),
        )


def _migration_002_chart_config(cursor: Any) -> None:
    """Ajoute chart_config à messages."""
    if not _table_exists(cursor, "messages"):
        return
    if not _column_exists(cursor, "messages", "chart_config"):
        cursor.execute("ALTER TABLE messages ADD COLUMN chart_config TEXT")


def _migration_003_costs_columns(cursor: Any) -> None:
    """Ajoute colonnes à llm_costs."""
    if not _table_exists(cursor, "llm_costs"):
        return
    columns = [
        ("conversation_id", "INTEGER"),
        ("success", "BOOLEAN DEFAULT TRUE"),
        ("error_message", "TEXT"),
    ]
    for col, typ in columns:
        if not _column_exists(cursor, "llm_costs", col):
            cursor.execute(f"ALTER TABLE llm_costs ADD COLUMN {col} {typ}")


def _migration_004_full_context(cursor: Any) -> None:
    """Ajoute full_context à columns."""
    if not _table_exists(cursor, "columns"):
        return
    if not _column_exists(cursor, "columns", "full_context"):
        cursor.execute("ALTER TABLE columns ADD COLUMN full_context TEXT")


def _migration_005_datasource_fields(cursor: Any) -> None:
    """Ajoute champs à datasources."""
    if not _table_exists(cursor, "datasources"):
        return
    columns = [
        ("is_active", "INTEGER DEFAULT 1"),
        ("file_size_bytes", "INTEGER"),
        ("last_modified", "TIMESTAMP"),
    ]
    for col, typ in columns:
        if not _column_exists(cursor, "datasources", col):
            cursor.execute(f"ALTER TABLE datasources ADD COLUMN {col} {typ}")


def _migration_006_prompt_v3(cursor: Any) -> None:
    """Met à jour le prompt analytics_system vers v3."""
    if not _table_exists(cursor, "llm_prompts"):
        return

    cursor.execute(
        "SELECT version FROM llm_prompts WHERE key = 'analytics_system' AND is_active = TRUE"
    )
    row = cursor.fetchone()
    if not row or row["version"] == "v3":
        return

    new_prompt = """Assistant analytique SQL. Réponds en français.

{schema}

CHOIX DE TABLE:
- evaluations: données brutes par course (64K lignes)
- evaluation_categories: données dénormalisées par catégorie avec sentiment_categorie (colonnes: categorie, sentiment_categorie). UTILISER CETTE TABLE pour toute analyse PAR CATÉGORIE.

TYPES DE GRAPHIQUES:
- bar: comparaisons entre catégories
- line: évolutions temporelles
- pie: répartitions (max 10 items)
- area: évolutions empilées
- scatter: corrélations (MAX 500 points)
- none: pas de visualisation

RÈGLES SQL:
- SQL DuckDB uniquement (SELECT)
- Alias en français
- ORDER BY pour rankings/évolutions
- LIMIT: "top N"→N, "tous"→pas de limit, défaut→500
- Agrégations (GROUP BY)→pas de LIMIT
- DUCKDB TIME: EXTRACT(HOUR FROM col), pas strftime
- GROUP BY: TOUJOURS utiliser l'expression complète, PAS l'alias

RÈGLE CRITIQUE - AGRÉGATION OBLIGATOIRE:
- Pour "distribution", "répartition", "par catégorie", "par type" → TOUJOURS utiliser GROUP BY + COUNT/AVG/SUM
- JAMAIS retourner des lignes individuelles pour ces questions (trop de données = crash frontend)
- Exemple CORRECT: SELECT lib_categorie, AVG(sentiment_global) FROM evaluations GROUP BY lib_categorie
- Exemple INTERDIT: SELECT lib_categorie, sentiment_global FROM evaluations (retourne 64K lignes!)

COLONNES DE CONTEXTE (pour requêtes détaillées uniquement):
- Pour les requêtes SANS agrégation (scatter, liste détaillée, exploration):
  * TOUJOURS ajouter LIMIT 500 pour éviter les crashs
  * Inclure des colonnes d'identification: cod_taxi, dat_course
  * Ajouter des colonnes de segmentation: typ_client, lib_categorie, typ_chauffeur
- Objectif: permettre à l'utilisateur de comprendre CHAQUE ligne du résultat
- Limite: 6-10 colonnes max pour la lisibilité

MULTI-SÉRIES (OBLIGATOIRE pour "par catégorie", "par type", "couleur par X"):
INTERDIT: GROUP BY avec colonne catégorie qui retourne plusieurs lignes par date.
OBLIGATOIRE: Utiliser FILTER pour PIVOTER les données (une colonne par catégorie).

RÉPONSE: Un seul objet JSON (pas de tableau):
{{"sql":"SELECT...","message":"Explication...","chart":{{"type":"...","x":"col","y":"col|[cols]","title":"..."}}}}"""

    cursor.execute(
        """UPDATE llm_prompts
           SET content = %s, version = 'v3', tokens_estimate = 750,
               description = 'Prompt système pour l''analyse Text-to-SQL. V3: règle agrégation obligatoire.'
           WHERE key = 'analytics_system' AND is_active = TRUE""",
        (new_prompt,),
    )


def _migration_007_datasets(cursor: Any) -> None:
    """Crée la table datasets pour le multi-dataset support."""
    if _table_exists(cursor, "datasets"):
        return

    cursor.execute("""
        CREATE TABLE datasets (
            id SERIAL PRIMARY KEY,
            dataset_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            duckdb_path TEXT,
            status TEXT DEFAULT 'empty' CHECK(status IN ('empty', 'syncing', 'ready', 'error')),
            is_active BOOLEAN DEFAULT FALSE,
            row_count INTEGER DEFAULT 0,
            table_count INTEGER DEFAULT 0,
            size_bytes INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("CREATE INDEX idx_datasets_status ON datasets(status)")
    cursor.execute("CREATE INDEX idx_datasets_active ON datasets(is_active)")
    cursor.execute("CREATE UNIQUE INDEX idx_datasets_name ON datasets(name)")


def _migration_008_datasources_sync(cursor: Any) -> None:
    """Ajoute les colonnes pour le sync PyAirbyte aux datasources."""
    if not _table_exists(cursor, "datasources"):
        return

    columns = [
        ("dataset_id", "TEXT"),
        ("source_type", "TEXT"),  # postgres, mysql, csv, gcs, s3...
        ("sync_config", "TEXT"),  # JSON config PyAirbyte (encrypted)
        ("sync_status", "TEXT DEFAULT 'pending'"),
        ("last_sync_at", "TIMESTAMP"),
        ("last_sync_error", "TEXT"),
    ]
    for col, typ in columns:
        if not _column_exists(cursor, "datasources", col):
            cursor.execute(f"ALTER TABLE datasources ADD COLUMN {col} {typ}")

    # Index pour recherche par dataset
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_datasources_dataset ON datasources(dataset_id)")


def _migration_009_bedrock_provider(cursor: Any) -> None:
    """Ajoute AWS Bedrock comme provider LLM."""
    if not _table_exists(cursor, "llm_providers"):
        return

    # Vérifier si bedrock existe déjà
    cursor.execute("SELECT id FROM llm_providers WHERE name = 'bedrock'")
    if cursor.fetchone():
        return

    # Ajouter le provider Bedrock (requires_api_key=FALSE car utilise AWS credentials)
    cursor.execute("""
        INSERT INTO llm_providers (name, display_name, type, requires_api_key, is_enabled)
        VALUES ('bedrock', 'AWS Bedrock', 'cloud', FALSE, TRUE)
        RETURNING id
    """)
    row = cursor.fetchone()
    if not row:
        return
    provider_id = row["id"]

    # Ajouter les modèles Bedrock
    models = [
        ("bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0", "Claude 3.5 Sonnet v2 (Bedrock)", 200000, 3.0, 15.0),
        ("bedrock/anthropic.claude-3-5-haiku-20241022-v1:0", "Claude 3.5 Haiku (Bedrock)", 200000, 0.8, 4.0),
        ("bedrock/anthropic.claude-3-opus-20240229-v1:0", "Claude 3 Opus (Bedrock)", 200000, 15.0, 75.0),
        ("bedrock/amazon.titan-text-premier-v1:0", "Amazon Titan Premier", 32000, 0.5, 1.5),
        ("bedrock/meta.llama3-1-70b-instruct-v1:0", "Llama 3.1 70B (Bedrock)", 128000, 0.99, 0.99),
        ("bedrock/meta.llama3-1-8b-instruct-v1:0", "Llama 3.1 8B (Bedrock)", 128000, 0.22, 0.22),
    ]

    for model_id, display_name, context_window, cost_input, cost_output in models:
        cursor.execute("""
            INSERT INTO llm_models
            (provider_id, model_id, display_name, supports_json_mode, supports_structured_output,
             context_window, cost_per_1m_input, cost_per_1m_output, is_enabled)
            VALUES (%s, %s, %s, TRUE, TRUE, %s, %s, %s, TRUE)
        """, (provider_id, model_id, display_name, context_window, cost_input, cost_output))


# =============================================================================
# EXECUTION
# =============================================================================

# Liste des migrations dans l'ordre
# Note: Les connecteurs sont gérés dynamiquement via PyAirbyte (pas de stockage local)
MIGRATIONS = [
    ("001", _migration_001_share_token),
    ("002", _migration_002_chart_config),
    ("003", _migration_003_costs_columns),
    ("004", _migration_004_full_context),
    ("005", _migration_005_datasource_fields),
    ("006", _migration_006_prompt_v3),
    ("007", _migration_007_datasets),
    ("008", _migration_008_datasources_sync),
    ("009", _migration_009_bedrock_provider),
]


def run_migrations(conn: Any) -> int:
    """
    Exécute les migrations de manière atomique.

    Args:
        conn: Connexion PostgreSQL

    Returns:
        Nombre de migrations appliquées

    Raises:
        MigrationError: Si une migration échoue
    """
    cursor = conn.cursor()

    # Créer la table de tracking si elle n'existe pas
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()

    # Récupérer les migrations déjà appliquées
    cursor.execute("SELECT version FROM _migrations")
    applied = {row["version"] for row in cursor.fetchall()}

    applied_count = 0

    for version, migration_fn in MIGRATIONS:
        if version in applied:
            continue

        logger.info("Applying migration %s", version)
        try:
            # Chaque migration dans une transaction
            migration_fn(cursor)
            cursor.execute("INSERT INTO _migrations (version) VALUES (%s)", (version,))
            conn.commit()
            applied_count += 1
            logger.info("Migration %s OK", version)
        except Exception as e:
            conn.rollback()
            logger.error("Migration %s FAILED: %s", version, e)
            raise MigrationError(f"Migration {version} failed: {e}") from e

    return applied_count
