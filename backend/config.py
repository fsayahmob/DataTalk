"""
Configuration centralisée pour DataTalk.

Tous les chemins et URLs configurables via variables d'environnement.
En développement local: utilise les valeurs par défaut (dossier backend/).
En Docker: utilise les named volumes avec chemins explicites.
"""

import os
from pathlib import Path

# =============================================================================
# BASE DE DONNÉES POSTGRESQL (Catalogue)
# =============================================================================
# PostgreSQL: catalogue sémantique, conversations, settings
# Docker: postgresql://datatalk:password@postgres:5432/datatalk
# Local: postgresql://localhost:5432/datatalk
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://datatalk:datatalk_dev@localhost:5432/datatalk",
)

# =============================================================================
# DUCKDB (Données analytiques OLAP)
# =============================================================================
# DuckDB: données analytiques
# Docker: /data/duckdb/datatalk.duckdb (named volume datatalk-duckdb)
# Local: ./data/datatalk.duckdb
_duckdb_env = os.getenv("DUCKDB_PATH")
DUCKDB_PATH = (
    Path(_duckdb_env) if _duckdb_env else Path(__file__).parent / "data" / "datatalk.duckdb"
)

# Répertoire pour les fichiers DuckDB des datasets (un fichier par dataset)
# Docker: /data/duckdb/ (même volume)
# Local: ./data/datasets/
_duckdb_dir_env = os.getenv("DUCKDB_DIR")
DUCKDB_DIR = Path(_duckdb_dir_env) if _duckdb_dir_env else Path(__file__).parent / "data" / "datasets"

# =============================================================================
# RÉPERTOIRE CACHE
# =============================================================================
# Docker: /data/cache (named volume datatalk-cache)
# Local: ./cache (relatif au backend)
_cache_env = os.getenv("CACHE_DIR")
CACHE_DIR = Path(_cache_env) if _cache_env else Path(__file__).parent / "cache"

# =============================================================================
# DATA_DIR (rétrocompatibilité)
# =============================================================================
# Utilisé par certains modules legacy. Pointe vers le dossier data/.
DATA_DIR = Path(__file__).parent / "data"

# Schéma SQL pour initialisation PostgreSQL
SCHEMA_PATH = Path(__file__).parent / "schema.sql"

# =============================================================================
# UPLOADS
# =============================================================================
UPLOADS_DIR = CACHE_DIR / "uploads"

# =============================================================================
# REDIS (pour Celery)
# =============================================================================
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


# =============================================================================
# INITIALISATION DES DOSSIERS
# =============================================================================
# Créer les dossiers nécessaires au démarrage
def init_directories() -> None:
    """Crée les dossiers requis s'ils n'existent pas."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DUCKDB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DUCKDB_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


# Auto-init si variable d'environnement Docker détectée
if _duckdb_env or _cache_env:
    init_directories()
