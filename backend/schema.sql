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
    is_enabled BOOLEAN DEFAULT 1,  -- Si FALSE, la table est exclue du prompt LLM
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
    is_primary_key BOOLEAN DEFAULT FALSE,
    sample_values TEXT,  -- Valeurs d'exemple séparées par ", "
    value_range TEXT,    -- Ex: "1-5" pour les notes
    full_context TEXT,   -- Stats complètes pour le LLM (null_rate, distinct, top_values, etc.)
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
-- NOTE: Les relations FK sont détectées dynamiquement dans le frontend (layoutUtils.ts)
-- basé sur les patterns de noms de colonnes (id_*, cod_*, *_id, etc.)

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

-- Questions suggérées (générées par LLM lors de l'enrichissement)
CREATE TABLE IF NOT EXISTS suggested_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    category TEXT,                   -- "Performance", "Tendances", "Alertes", etc.
    icon TEXT,                       -- Emoji
    display_order INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- KPIs dynamiques (générés par LLM - structure KpiCompactData)
-- NOTE: Les champs correspondent au modèle Pydantic KpiDefinition dans catalog_engine.py
CREATE TABLE IF NOT EXISTS kpis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kpi_id TEXT UNIQUE NOT NULL,     -- Slug unique (ex: "total-evaluations")
    title TEXT NOT NULL,             -- Titre du KPI (max 20 caractères)
    sql_value TEXT NOT NULL,         -- Requête pour la valeur actuelle (1 ligne)
    sql_trend TEXT,                  -- Requête pour la valeur période précédente (1 ligne)
    sql_sparkline TEXT,              -- Requête pour l'historique (12-15 points)
    sparkline_type TEXT DEFAULT 'area',  -- "area" ou "bar"
    footer TEXT,                     -- Texte explicatif avec la période
    trend_label TEXT,                -- Ex: "vs 1ère quinzaine"
    invert_trend BOOLEAN DEFAULT FALSE, -- Si TRUE, baisse=vert, hausse=rouge (ex: taux erreur, insatisfaction)
    display_order INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- =============================================
-- DONNÉES PAR DÉFAUT
-- =============================================

-- Providers LLM
INSERT OR IGNORE INTO llm_providers (name, display_name, type, requires_api_key) VALUES
    ('google', 'Google AI', 'cloud', 1),
    ('openai', 'OpenAI', 'cloud', 1),
    ('anthropic', 'Anthropic', 'cloud', 1),
    ('mistral', 'Mistral AI', 'cloud', 1),
    ('ollama', 'Ollama', 'self-hosted', 0);

-- Modèles LLM (Google AI)
INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'gemini-2.0-flash', 'Gemini 2.0 Flash', 1000000, 0.10, 0.40, 1
FROM llm_providers p WHERE p.name = 'google';

INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'gemini-2.5-flash', 'Gemini 2.5 Flash', 1000000, 0.30, 2.50, 0
FROM llm_providers p WHERE p.name = 'google';

INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 1000000, 0.10, 0.40, 0
FROM llm_providers p WHERE p.name = 'google';

INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'gemini-2.5-pro', 'Gemini 2.5 Pro', 1000000, 1.25, 10.00, 0
FROM llm_providers p WHERE p.name = 'google';

-- Modèles LLM (OpenAI)
INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'gpt-4o', 'GPT-4o', 128000, 2.50, 10.00, 0
FROM llm_providers p WHERE p.name = 'openai';

INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'gpt-4o-mini', 'GPT-4o Mini', 128000, 0.15, 0.60, 0
FROM llm_providers p WHERE p.name = 'openai';

INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'gpt-4.1', 'GPT-4.1', 1000000, 2.00, 8.00, 0
FROM llm_providers p WHERE p.name = 'openai';

INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'gpt-4.1-mini', 'GPT-4.1 Mini', 1000000, 0.40, 1.60, 0
FROM llm_providers p WHERE p.name = 'openai';

-- Modèles LLM (Anthropic)
INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 200000, 3.00, 15.00, 0
FROM llm_providers p WHERE p.name = 'anthropic';

INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', 200000, 0.80, 4.00, 0
FROM llm_providers p WHERE p.name = 'anthropic';

INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'claude-opus-4-20250514', 'Claude Opus 4', 200000, 15.00, 75.00, 0
FROM llm_providers p WHERE p.name = 'anthropic';

-- Modèles LLM (Mistral)
INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'mistral-large-latest', 'Mistral Large', 128000, 2.00, 6.00, 0
FROM llm_providers p WHERE p.name = 'mistral';

INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'mistral-small-latest', 'Mistral Small', 128000, 0.20, 0.60, 0
FROM llm_providers p WHERE p.name = 'mistral';

INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'codestral-latest', 'Codestral', 256000, 0.30, 0.90, 0
FROM llm_providers p WHERE p.name = 'mistral';

-- Modèles LLM (Ollama - local, pas de coût)
INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'llama3.2', 'Llama 3.2 (Local)', 128000, NULL, NULL, 0
FROM llm_providers p WHERE p.name = 'ollama';

INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'mistral', 'Mistral (Local)', 32000, NULL, NULL, 0
FROM llm_providers p WHERE p.name = 'ollama';

INSERT OR IGNORE INTO llm_models (provider_id, model_id, display_name, context_window, cost_per_1m_input, cost_per_1m_output, is_default)
SELECT p.id, 'qwen2.5-coder', 'Qwen 2.5 Coder (Local)', 128000, NULL, NULL, 0
FROM llm_providers p WHERE p.name = 'ollama';

-- Prompts LLM (analytics) - Version unique
INSERT OR IGNORE INTO llm_prompts (key, name, category, content, version, is_active, tokens_estimate, description) VALUES
('analytics_system', 'Analytics System', 'analytics', 'Assistant analytique SQL. Réponds en français.

{schema}

CHOIX DE TABLE:
- evaluations: données brutes par course (64K lignes)
- evaluation_categories: données dénormalisées par catégorie avec sentiment_categorie (colonnes: categorie, sentiment_categorie). UTILISER CETTE TABLE pour toute analyse PAR CATÉGORIE.

TYPES DE GRAPHIQUES:
- bar: comparaisons entre catégories
- line: évolutions temporelles
- pie: répartitions (max 10 items)
- area: évolutions empilées
- scatter: corrélations
- none: pas de visualisation

RÈGLES SQL:
- SQL DuckDB uniquement (SELECT)
- Alias en français
- ORDER BY pour rankings/évolutions
- LIMIT: "top N"→N, "tous"→pas de limit, défaut→500
- Agrégations (GROUP BY)→pas de LIMIT
- DUCKDB TIME: EXTRACT(HOUR FROM col), pas strftime
- GROUP BY: TOUJOURS utiliser l''expression complète, PAS l''alias

MULTI-SÉRIES (OBLIGATOIRE pour "par catégorie", "par type", "couleur par X"):
INTERDIT: GROUP BY avec colonne catégorie qui retourne plusieurs lignes par date.
OBLIGATOIRE: Utiliser FILTER pour PIVOTER les données (une colonne par catégorie).

RÉPONSE: Un seul objet JSON (pas de tableau):
{"sql":"SELECT...","message":"Explication...","chart":{"type":"...","x":"col","y":"col|[cols]","title":"..."}}', 'v1', 1, 600, 'Prompt système pour l''analyse Text-to-SQL. Inclut le schéma DB via {schema}.');

-- Prompt catalog enrichment (le contexte {tables_context} est injecté en mode compact ou full)
INSERT OR IGNORE INTO llm_prompts (key, name, category, content, version, is_active, tokens_estimate, description) VALUES
('catalog_enrichment', 'Catalog Enrichment', 'catalog', 'Tu es un expert en data catalog. Analyse cette structure de base de données et génère des descriptions sémantiques.

STRUCTURE À DOCUMENTER:
{tables_context}

INSTRUCTIONS:
- Déduis le contexte métier à partir des noms et des exemples de valeurs
- Génère des descriptions claires en français
- Pour chaque colonne, propose 2-3 synonymes (termes alternatifs pour recherche NLP)
- Descriptions concises mais complètes', 'v1', 1, 200, 'Génération de descriptions sémantiques pour le catalogue. Le placeholder {tables_context} est rempli selon le mode choisi: compact (nom, type, exemples) ou full (stats avancées, ENUM, distribution).');

-- Prompt widgets generation
INSERT OR IGNORE INTO llm_prompts (key, name, category, content, version, is_active, tokens_estimate, description) VALUES
('widgets_generation', 'Widgets Generation', 'widgets', 'Tu es un analyste métier expert. Génère exactement 4 KPIs pour ce dashboard.

SCHÉMA DE DONNÉES:
{schema}

PÉRIODE DES DONNÉES:
{data_period}

STRUCTURE D''UN KPI (KpiCompactData):
Chaque KPI a besoin de 3 requêtes SQL:
1. sql_value: Retourne UNE valeur (la métrique actuelle sur toute la période)
2. sql_trend: Retourne UNE valeur de la première moitié de la période (pour calculer le % de variation)
3. sql_sparkline: Retourne 12-15 valeurs ordonnées chronologiquement (historique pour le mini-graphe)

CHAMPS À REMPLIR (générés automatiquement depuis le modèle):
{kpi_fields}

RÈGLES SQL:
- DuckDB uniquement (pas MySQL, pas PostgreSQL)
- sql_value et sql_trend: SELECT qui retourne UNE SEULE LIGNE avec colonne "value"
- sql_sparkline: SELECT qui retourne 12-15 lignes avec colonne "value", ordonnées par date ASC
- Utilise les vraies colonnes de date du schéma
- Adapte la comparaison de tendance à la profondeur des données disponibles

RÉPONSE JSON STRICTE (pas de texte avant/après):
{
  "kpis": [
    {
      "id": "total-evaluations",
      "title": "Total Évaluations",
      "sql_value": "SELECT COUNT(*) AS value FROM evaluations",
      "sql_trend": "SELECT COUNT(*) AS value FROM evaluations WHERE dat_course < ''2024-05-15''",
      "sql_sparkline": "SELECT COUNT(*) AS value FROM evaluations GROUP BY DATE_TRUNC(''day'', dat_course) ORDER BY DATE_TRUNC(''day'', dat_course) LIMIT 15",
      "sparkline_type": "area",
      "footer": "Mai 2024",
      "trend_label": "vs 1ère quinzaine",
      "invert_trend": false
    }
  ]
}

CONSIGNES:
- Génère EXACTEMENT 4 KPIs pertinents pour le métier détecté
- Choisis des métriques business importantes (volumes, moyennes, ratios, taux)
- Adapte les requêtes trend à la période disponible (compare 1ère moitié vs total)
- Varie les sparkline_type (2 "area" et 2 "bar")
- footer doit indiquer la période des données
- IMPORTANT: Mets invert_trend=true pour les KPIs où une baisse est POSITIVE', 'v1', 1, 800, 'Génération des widgets et KPIs. Placeholders {schema}, {data_period}, {kpi_fields}.');

-- =============================================
-- SETTINGS PAR DÉFAUT
-- =============================================

-- Mode de contexte pour l'enrichissement du catalogue
-- "compact": format simple (nom, type, exemples, range) ~800 tokens
-- "full": format enrichi (stats, ENUM, distribution, patterns) ~2200 tokens
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('catalog_context_mode', 'full');

-- Chemin vers la base DuckDB
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('duckdb_path', 'data/g7_analytics.duckdb');

-- Nombre max de tables par batch pour l'enrichissement LLM
-- Réduit cette valeur si erreur "too many states" avec Vertex AI
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('max_tables_per_batch', '15');

-- =============================================
-- PIPELINE TRACKING
-- =============================================

-- Jobs du catalogue (extraction + enrichissement)
-- Tous les jobs d'une même run partagent le même run_id (comme Google Cloud Build)
CREATE TABLE IF NOT EXISTS catalog_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,   -- UUID commun pour extraction + enrichment
    job_type TEXT NOT NULL CHECK(job_type IN ('extraction', 'enrichment')),
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed')),

    -- Progression
    current_step TEXT,      -- Ex: "extract_metadata", "llm_batch_2", "generate_questions"
    step_index INTEGER,     -- Index actuel (0-based)
    total_steps INTEGER,    -- Nombre total de steps (calculé dynamiquement)
    progress INTEGER DEFAULT 0,  -- Pourcentage 0-100

    -- Contexte
    details TEXT,           -- JSON: {"batch": "2/4", "tables": [...], "mode": "compact"}
    result TEXT,            -- JSON: {"tables": 12, "columns": 90, "synonyms": 245, "kpis": 4, "questions": 8}
    error_message TEXT,

    -- Timestamps
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Index pour les requêtes de suivi de pipeline
CREATE INDEX IF NOT EXISTS idx_jobs_run_id ON catalog_jobs(run_id);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON catalog_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON catalog_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_started ON catalog_jobs(started_at DESC);
