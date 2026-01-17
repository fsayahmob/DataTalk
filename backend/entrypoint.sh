#!/bin/bash
# =============================================================================
# DataTalk API Entrypoint
# =============================================================================
# Script idempotent d'initialisation avant le démarrage de l'API.
# - Vérifie/crée les répertoires des volumes
# - Initialise SQLite si absente ou vide
# - Vérifie les permissions d'écriture
# =============================================================================

set -e

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[init]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[init]${NC} $1"; }
log_error() { echo -e "${RED}[init]${NC} $1"; }

# =============================================================================
# Configuration (depuis variables d'environnement)
# =============================================================================
SQLITE_PATH="${SQLITE_PATH:-/data/sqlite/catalog.sqlite}"
DUCKDB_PATH="${DUCKDB_PATH:-/data/duckdb/datatalk.duckdb}"
CACHE_DIR="${CACHE_DIR:-/data/cache}"

# =============================================================================
# 1. Créer les répertoires si nécessaires
# =============================================================================
log_info "Vérification des répertoires..."

mkdir -p "$(dirname "$SQLITE_PATH")"
mkdir -p "$(dirname "$DUCKDB_PATH")"
mkdir -p "$CACHE_DIR"
mkdir -p "$CACHE_DIR/uploads"

log_info "Répertoires OK"

# =============================================================================
# 2. Vérifier les permissions d'écriture
# =============================================================================
log_info "Vérification des permissions..."

check_writable() {
    local path="$1"
    local name="$2"
    local test_file="$path/.write_test_$$"

    if touch "$test_file" 2>/dev/null; then
        rm -f "$test_file"
        log_info "  $name: OK (écriture possible)"
        return 0
    else
        log_warn "  $name: lecture seule ou pas d'accès"
        return 1
    fi
}

check_writable "$(dirname "$SQLITE_PATH")" "Volume SQLite"
# DuckDB peut être en lecture seule pour le worker - pas d'erreur fatale
check_writable "$(dirname "$DUCKDB_PATH")" "Volume DuckDB" || true
check_writable "$CACHE_DIR" "Volume Cache"

# =============================================================================
# 3. Initialiser SQLite si absente ou vide
# =============================================================================
if [ ! -s "$SQLITE_PATH" ]; then
    log_warn "Base SQLite absente ou vide, initialisation..."

    # Utiliser Python pour initialiser avec schema.sql
    python3 -c "
import sqlite3
from pathlib import Path

schema_path = Path('/app/schema.sql')
db_path = Path('$SQLITE_PATH')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Exécuter le schéma
if schema_path.exists():
    schema = schema_path.read_text()
    cursor.executescript(schema)
    print('[init] Schéma SQL appliqué')
else:
    print('[init] ATTENTION: schema.sql non trouvé')

conn.commit()
conn.close()
print('[init] SQLite initialisée:', db_path)
"

    log_info "Base SQLite initialisée avec succès"
else
    log_info "Base SQLite existante détectée ($(du -h "$SQLITE_PATH" | cut -f1))"
fi

# =============================================================================
# 4. Afficher le résumé
# =============================================================================
echo ""
log_info "=== Résumé de l'initialisation ==="
log_info "  SQLite: $SQLITE_PATH"
log_info "  DuckDB: $DUCKDB_PATH"
log_info "  Cache:  $CACHE_DIR"

if [ -f "$DUCKDB_PATH" ]; then
    log_info "  Dataset: présent ($(du -h "$DUCKDB_PATH" | cut -f1))"
else
    log_info "  Dataset: aucun (sera créé au premier upload)"
fi
echo ""

# =============================================================================
# 5. Lancer la commande principale (uvicorn, celery, etc.)
# =============================================================================
log_info "Démarrage de l'application..."
exec "$@"
