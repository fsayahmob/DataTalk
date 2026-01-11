-- =============================================
-- G7 Analytics - Schema SQLite
-- =============================================
-- Ce fichier permet de restaurer la structure de la base de données
-- après un rollback git ou pour une installation propre.
--
-- Usage:
--   sqlite3 catalog.sqlite < schema.sql
--
-- Note: Les tables sont créées avec IF NOT EXISTS pour être idempotent.
-- =============================================

-- =============================================
-- CATALOGUE SÉMANTIQUE
-- =============================================

-- Sources de données (DuckDB, Postgres, etc.)
CREATE TABLE IF NOT EXISTS datasources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,  -- 'duckdb', 'postgres', 'mysql', etc.
    path TEXT,           -- Chemin ou connection string
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tables du catalogue
CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datasource_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    row_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (datasource_id) REFERENCES datasources(id),
    UNIQUE(datasource_id, name)
);

-- Colonnes des tables
CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    data_type TEXT NOT NULL,
    description TEXT,
    is_nullable BOOLEAN DEFAULT TRUE,
    is_primary_key BOOLEAN DEFAULT FALSE,
    sample_values TEXT,  -- JSON array des valeurs d'exemple
    value_range TEXT,    -- Ex: "1-5" pour les notes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (table_id) REFERENCES tables(id),
    UNIQUE(table_id, name)
);

-- Synonymes pour le NLP (recherche sémantique)
CREATE TABLE IF NOT EXISTS synonyms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    column_id INTEGER NOT NULL,
    term TEXT NOT NULL,
    FOREIGN KEY (column_id) REFERENCES columns(id)
);

-- Relations entre tables
CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_column_id INTEGER NOT NULL,
    to_column_id INTEGER NOT NULL,
    relationship_type TEXT NOT NULL,  -- '1:1', '1:N', 'N:N'
    FOREIGN KEY (from_column_id) REFERENCES columns(id),
    FOREIGN KEY (to_column_id) REFERENCES columns(id)
);

-- =============================================
-- INTERFACE UTILISATEUR
-- =============================================

-- Conversations (sessions de chat)
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,  -- Généré automatiquement depuis la première question
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages (questions + réponses dans une conversation)
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL,  -- 'user' ou 'assistant'
    content TEXT NOT NULL,  -- Question ou message de réponse
    sql_query TEXT,  -- SQL généré (null pour les messages user)
    chart_config TEXT,  -- JSON config du graphique
    data_json TEXT,  -- Résultats JSON (limité pour stockage)
    -- Métadonnées de performance
    model_name TEXT,  -- Ex: "gemini-2.0-flash"
    tokens_input INTEGER,
    tokens_output INTEGER,
    response_time_ms INTEGER,  -- Temps de réponse en millisecondes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Rapports sauvegardés (favoris)
CREATE TABLE IF NOT EXISTS saved_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    question TEXT NOT NULL,
    sql_query TEXT NOT NULL,
    chart_config TEXT,  -- JSON: {"type": "bar", "x": "col", "y": "col", "title": "..."}
    message_id INTEGER,  -- Référence au message d'origine (optionnel)
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
);

-- Configuration (clé API, préférences)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- WIDGETS DYNAMIQUES
-- =============================================

-- Widgets (générés par LLM lors de la création du catalogue)
CREATE TABLE IF NOT EXISTS widgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    widget_id TEXT UNIQUE NOT NULL,  -- UUID ou slug unique
    title TEXT NOT NULL,
    description TEXT,
    icon TEXT,                       -- Emoji optionnel
    sql_query TEXT NOT NULL,         -- Requête SQL à exécuter sur DuckDB
    chart_type TEXT NOT NULL,        -- "bar", "line", "pie", "area", "scatter", "none"
    chart_config TEXT,               -- JSON: {"x": "col", "y": "col", "title": "..."}
    display_order INTEGER DEFAULT 0,
    priority TEXT DEFAULT 'normal',  -- "high" = KPI en haut, "normal" = widget standard
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cache des résultats des widgets
CREATE TABLE IF NOT EXISTS widget_cache (
    widget_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,              -- JSON: résultat de la requête SQL
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,            -- NULL = pas d'expiration
    FOREIGN KEY (widget_id) REFERENCES widgets(widget_id) ON DELETE CASCADE
);

-- Questions suggérées (générées par LLM)
CREATE TABLE IF NOT EXISTS suggested_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    category TEXT,                   -- "Performance", "Tendances", "Alertes", etc.
    icon TEXT,                       -- Emoji
    business_value TEXT,             -- Pourquoi poser cette question
    display_order INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- LLM CONFIGURATION
-- =============================================

-- Providers LLM (Gemini, OpenAI, Ollama, etc.)
CREATE TABLE IF NOT EXISTS llm_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    type TEXT NOT NULL,              -- 'cloud' ou 'self-hosted'
    base_url TEXT,
    requires_api_key BOOLEAN DEFAULT 1,
    is_enabled BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Modèles LLM disponibles
CREATE TABLE IF NOT EXISTS llm_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    model_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    supports_json_mode BOOLEAN DEFAULT 1,
    supports_structured_output BOOLEAN DEFAULT 1,
    context_window INTEGER,
    cost_per_1m_input REAL,
    cost_per_1m_output REAL,
    is_default BOOLEAN DEFAULT 0,
    is_enabled BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES llm_providers(id)
);

-- Secrets LLM (clés API chiffrées)
CREATE TABLE IF NOT EXISTS llm_secrets (
    provider_id INTEGER PRIMARY KEY,
    encrypted_api_key BLOB,
    key_hint TEXT,                   -- Ex: "sk-...abc" pour identification
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES llm_providers(id)
);

-- Historique des coûts LLM
CREATE TABLE IF NOT EXISTS llm_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER NOT NULL,
    source TEXT NOT NULL,            -- 'analytics', 'catalog', 'widgets'
    conversation_id INTEGER,
    tokens_input INTEGER NOT NULL,
    tokens_output INTEGER NOT NULL,
    cost_input REAL,
    cost_output REAL,
    cost_total REAL,
    response_time_ms INTEGER,
    success BOOLEAN DEFAULT 1,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (model_id) REFERENCES llm_models(id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Index pour les requêtes de stats sur les coûts
CREATE INDEX IF NOT EXISTS idx_costs_model ON llm_costs(model_id);
CREATE INDEX IF NOT EXISTS idx_costs_date ON llm_costs(created_at);
CREATE INDEX IF NOT EXISTS idx_costs_source ON llm_costs(source);

-- Prompts LLM (stockage centralisé et versionné)
CREATE TABLE IF NOT EXISTS llm_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,               -- 'analytics_system', 'catalog_enrichment', etc.
    name TEXT NOT NULL,
    category TEXT NOT NULL,          -- 'analytics', 'catalog', 'widgets'
    content TEXT NOT NULL,
    version TEXT DEFAULT 'normal',   -- 'normal', 'optimized', 'v2', etc.
    is_active BOOLEAN DEFAULT 0,
    tokens_estimate INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(key, version)
);

-- Index pour les prompts
CREATE INDEX IF NOT EXISTS idx_prompts_key ON llm_prompts(key);
CREATE INDEX IF NOT EXISTS idx_prompts_category ON llm_prompts(category);
CREATE INDEX IF NOT EXISTS idx_prompts_active ON llm_prompts(is_active);
