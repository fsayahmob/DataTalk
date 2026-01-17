"""
Configuration centralisée pour G7 Analytics.

Tous les chemins et URLs configurables via variables d'environnement.
En développement local: utilise les valeurs par défaut (dossier backend/).
En Docker: utilise DATA_DIR=/data (volume partagé entre containers).
"""

import os
from pathlib import Path

# =============================================================================
# RÉPERTOIRE DE DONNÉES
# =============================================================================
# En local: ./data (relatif au backend)
# En Docker: /data (volume partagé)
_data_dir_env = os.getenv("DATA_DIR")
DATA_DIR = Path(_data_dir_env) if _data_dir_env else Path(__file__).parent

# =============================================================================
# CHEMINS BASES DE DONNÉES
# =============================================================================
# SQLite: catalogue sémantique, conversations, settings
SQLITE_PATH = DATA_DIR / "catalog.sqlite"

# DuckDB: données analytiques (fichier G7)
# Note: peut être overridé via setting "duckdb_path" dans SQLite
DUCKDB_PATH = DATA_DIR / "g7_analytics.duckdb"

# Schéma SQL pour initialisation
SCHEMA_PATH = Path(__file__).parent / "schema.sql"

# =============================================================================
# UPLOADS
# =============================================================================
UPLOADS_DIR = DATA_DIR / "uploads"

# =============================================================================
# REDIS (pour Celery)
# =============================================================================
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# =============================================================================
# INITIALISATION DES DOSSIERS
# =============================================================================
# Ne créer les dossiers que si DATA_DIR est configuré explicitement
# (en Docker ou en dev avec variable d'env)
if _data_dir_env:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
