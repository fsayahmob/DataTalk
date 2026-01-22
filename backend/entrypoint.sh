#!/bin/bash
# =============================================================================
# DataTalk API Entrypoint
# =============================================================================
# Script idempotent d'initialisation avant le démarrage de l'API.
# - Attend que PostgreSQL soit prêt
# - Vérifie/crée les répertoires des volumes
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
DUCKDB_PATH="${DUCKDB_PATH:-/data/duckdb/datatalk.duckdb}"
DUCKDB_DIR="${DUCKDB_DIR:-/data/duckdb/datasets}"
CACHE_DIR="${CACHE_DIR:-/data/cache}"
DATABASE_URL="${DATABASE_URL:-postgresql://datatalk:datatalk_dev@postgres:5432/datatalk}"

# =============================================================================
# 1. Créer les répertoires si nécessaires
# =============================================================================
log_info "Vérification des répertoires..."

mkdir -p "$(dirname "$DUCKDB_PATH")"
mkdir -p "$DUCKDB_DIR"
mkdir -p "$CACHE_DIR"
mkdir -p "$CACHE_DIR/uploads"

log_info "Répertoires OK"

# =============================================================================
# 2. Attendre que PostgreSQL soit prêt
# =============================================================================
log_info "Vérification de la connexion PostgreSQL..."

# Extraire host et port de DATABASE_URL
# Format: postgresql://user:pass@host:port/dbname
PG_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
PG_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
PG_HOST=${PG_HOST:-postgres}
PG_PORT=${PG_PORT:-5432}

MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if pg_isready -h "$PG_HOST" -p "$PG_PORT" -q 2>/dev/null; then
        log_info "PostgreSQL est prêt!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    log_warn "PostgreSQL pas encore prêt, tentative $RETRY_COUNT/$MAX_RETRIES..."
    sleep 1
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    log_error "PostgreSQL n'est pas accessible après $MAX_RETRIES tentatives"
    exit 1
fi

# =============================================================================
# 3. Vérifier les permissions d'écriture
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

check_writable "$(dirname "$DUCKDB_PATH")" "Volume DuckDB" || true
check_writable "$DUCKDB_DIR" "Répertoire Datasets" || true
check_writable "$CACHE_DIR" "Volume Cache"

# =============================================================================
# 4. Afficher le résumé
# =============================================================================
echo ""
log_info "=== Résumé de l'initialisation ==="
log_info "  PostgreSQL: $PG_HOST:$PG_PORT"
log_info "  DuckDB:     $DUCKDB_PATH"
log_info "  Datasets:   $DUCKDB_DIR"
log_info "  Cache:      $CACHE_DIR"

if [ -f "$DUCKDB_PATH" ]; then
    log_info "  Dataset principal: présent ($(du -h "$DUCKDB_PATH" | cut -f1))"
else
    log_info "  Dataset principal: aucun (sera créé au premier upload)"
fi

DATASET_COUNT=$(find "$DUCKDB_DIR" -name "*.duckdb" 2>/dev/null | wc -l | tr -d ' ')
log_info "  Datasets isolés: $DATASET_COUNT fichier(s)"
echo ""

# =============================================================================
# 5. Lancer la commande principale (uvicorn, celery, etc.)
# =============================================================================
log_info "Démarrage de l'application..."
exec "$@"
