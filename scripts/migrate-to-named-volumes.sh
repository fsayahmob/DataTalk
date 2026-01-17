#!/bin/bash
# =============================================================================
# Migration des données vers named volumes Docker
# =============================================================================
# Ce script migre les données de ./data/ (bind mount) vers les named volumes
# utilisés par la nouvelle architecture DataTalk.
#
# Usage:
#   chmod +x scripts/migrate-to-named-volumes.sh
#   ./scripts/migrate-to-named-volumes.sh
#
# Prérequis:
#   - Docker doit être en cours d'exécution
#   - Les fichiers doivent exister dans ./data/
# =============================================================================

set -e  # Arrêter en cas d'erreur

echo "🚀 Migration vers named volumes DataTalk"
echo "========================================="

# Vérifier que Docker est disponible
if ! docker info > /dev/null 2>&1; then
    echo "❌ Erreur: Docker n'est pas en cours d'exécution"
    exit 1
fi

# Vérifier que le dossier data existe
if [ ! -d "./data" ]; then
    echo "❌ Erreur: Le dossier ./data n'existe pas"
    exit 1
fi

# Arrêter les containers existants
echo ""
echo "📦 Arrêt des containers existants..."
docker compose down 2>/dev/null || true

# Créer les volumes s'ils n'existent pas
echo ""
echo "📁 Création des named volumes..."
docker volume create datatalk-sqlite 2>/dev/null || echo "   datatalk-sqlite existe déjà"
docker volume create datatalk-duckdb 2>/dev/null || echo "   datatalk-duckdb existe déjà"
docker volume create datatalk-cache 2>/dev/null || echo "   datatalk-cache existe déjà"
docker volume create datatalk-redis 2>/dev/null || echo "   datatalk-redis existe déjà"

# Migration SQLite
if [ -f "./data/catalog.sqlite" ]; then
    echo ""
    echo "📋 Migration de catalog.sqlite..."
    docker run --rm \
        -v "$(pwd)/data:/src:ro" \
        -v datatalk-sqlite:/dst \
        alpine sh -c "cp /src/catalog.sqlite /dst/catalog.sqlite && chown -R 1000:1000 /dst"
    echo "   ✅ catalog.sqlite migré vers datatalk-sqlite"
else
    echo ""
    echo "⚠️  catalog.sqlite non trouvé dans ./data/"
fi

# Migration DuckDB
if [ -f "./data/g7_analytics.duckdb" ]; then
    echo ""
    echo "🦆 Migration de g7_analytics.duckdb → datatalk.duckdb..."
    docker run --rm \
        -v "$(pwd)/data:/src:ro" \
        -v datatalk-duckdb:/dst \
        alpine sh -c "cp /src/g7_analytics.duckdb /dst/datatalk.duckdb && chown -R 1000:1000 /dst"
    echo "   ✅ DuckDB migré vers datatalk-duckdb (renommé en datatalk.duckdb)"
else
    echo ""
    echo "⚠️  g7_analytics.duckdb non trouvé dans ./data/"
fi

# Créer le dossier cache (vide)
echo ""
echo "🗂️  Initialisation du volume cache..."
docker run --rm \
    -v datatalk-cache:/dst \
    alpine sh -c "mkdir -p /dst/uploads && chown -R 1000:1000 /dst"
echo "   ✅ Volume cache initialisé"

# Vérification
echo ""
echo "🔍 Vérification des volumes..."
echo ""
echo "datatalk-sqlite:"
docker run --rm -v datatalk-sqlite:/data alpine ls -la /data 2>/dev/null || echo "   (vide)"
echo ""
echo "datatalk-duckdb:"
docker run --rm -v datatalk-duckdb:/data alpine ls -la /data 2>/dev/null || echo "   (vide)"
echo ""
echo "datatalk-cache:"
docker run --rm -v datatalk-cache:/data alpine ls -la /data 2>/dev/null || echo "   (vide)"

echo ""
echo "========================================="
echo "✅ Migration terminée!"
echo ""
echo "Prochaines étapes:"
echo "  1. docker compose up -d"
echo "  2. Vérifier http://localhost:8000/health"
echo "  3. (Optionnel) Supprimer ./data/ une fois validé"
echo ""
