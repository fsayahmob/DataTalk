-- =============================================================================
-- PostgreSQL - Script d'initialisation DataTalk
-- =============================================================================
-- Exécuté automatiquement au premier démarrage du container
-- =============================================================================

-- Optimisations de session par défaut
ALTER DATABASE datatalk SET timezone TO 'UTC';
ALTER DATABASE datatalk SET default_transaction_isolation TO 'read committed';

-- Extension pour les UUID (déjà incluse dans PostgreSQL 16)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Extension pour les fonctions de recherche textuelle
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Stats avancées pour le query planner
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- =============================================================================
-- COMMENTAIRES
-- =============================================================================
COMMENT ON DATABASE datatalk IS 'DataTalk - Catalogue sémantique et métadonnées';
