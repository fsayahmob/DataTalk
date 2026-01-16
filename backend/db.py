"""
Connexion SQLite centralisée pour G7 Analytics.

La structure de la base est définie dans schema.sql (source unique de vérité).
Pour initialiser/recréer la base: sqlite3 catalog.sqlite < schema.sql
"""

import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from collections.abc import Generator

CATALOG_PATH = str(Path(__file__).parent / "catalog.sqlite")
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def init_database() -> None:
    """Initialise la base de données avec schema.sql si elle n'existe pas."""
    if Path(CATALOG_PATH).exists():
        return  # Base déjà existante

    if not SCHEMA_PATH.exists():
        return  # Pas de schéma disponible

    conn = sqlite3.connect(CATALOG_PATH)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.commit()
    conn.close()


def get_connection() -> sqlite3.Connection:
    """Retourne une connexion au catalogue SQLite."""
    conn = sqlite3.connect(CATALOG_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """
    Context manager pour les connexions SQLite.

    Gère automatiquement le commit/rollback et la fermeture de connexion.

    Usage:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM ...")
            # commit automatique si pas d'exception
    """
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def run_migrations() -> None:
    """Exécute les migrations de schéma si nécessaire."""
    conn = get_connection()
    cursor = conn.cursor()

    # Vérifier si la table saved_reports existe (peut ne pas exister en CI/tests)
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='saved_reports'")
    if not cursor.fetchone():
        conn.close()
        return  # Pas de base initialisée, skip migrations

    # Migration 1: Ajouter share_token à saved_reports si absente
    cursor.execute("PRAGMA table_info(saved_reports)")
    columns = [col[1] for col in cursor.fetchall()]

    if "share_token" not in columns:
        # SQLite ne permet pas ADD COLUMN avec UNIQUE, on ajoute sans contrainte
        cursor.execute("ALTER TABLE saved_reports ADD COLUMN share_token TEXT")
        # Créer un index unique séparé
        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_share_token ON saved_reports(share_token)"
        )
        # Générer des tokens pour les rapports existants
        cursor.execute("SELECT id FROM saved_reports WHERE share_token IS NULL")
        for row in cursor.fetchall():
            cursor.execute(
                "UPDATE saved_reports SET share_token = ? WHERE id = ?",
                (str(uuid.uuid4()), row[0]),
            )
        conn.commit()

    # Migration 2: Mettre à jour le prompt analytics_system vers v3 (agrégation obligatoire)
    # Vérifier si la table llm_prompts existe
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='llm_prompts'")
    if not cursor.fetchone():
        conn.close()
        return  # Table llm_prompts n'existe pas, skip

    cursor.execute(
        "SELECT version FROM llm_prompts WHERE key = 'analytics_system' AND is_active = 1"
    )
    row = cursor.fetchone()
    if row and row[0] != "v3":
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
               SET content = ?, version = 'v3', tokens_estimate = 750,
                   description = 'Prompt système pour l''analyse Text-to-SQL. V3: règle agrégation obligatoire.'
               WHERE key = 'analytics_system' AND is_active = 1""",
            (new_prompt,),
        )
        conn.commit()

    conn.close()


# Initialiser la base et exécuter les migrations au chargement du module
init_database()
run_migrations()
