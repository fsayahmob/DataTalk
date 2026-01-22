-- =============================================
-- G7 Analytics - Schema SQLite (Auto-generated)
-- =============================================

-- TABLES
CREATE TABLE IF NOT EXISTS _migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE IF NOT EXISTS catalog_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    job_type TEXT NOT NULL CHECK(job_type IN ('extraction', 'enrichment', 'sync')),
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed')),
    current_step TEXT,
    step_index INTEGER,
    total_steps INTEGER,
    progress INTEGER DEFAULT 0,
    details TEXT,
    result TEXT,
    error_message TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

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
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, full_context TEXT,
            FOREIGN KEY (table_id) REFERENCES tables(id),
            UNIQUE(table_id, name)
        );

CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,  -- Généré automatiquement depuis la première question
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE IF NOT EXISTS datasources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,  -- 'duckdb', 'postgres', 'mysql', etc.
            dataset_id TEXT,     -- UUID du dataset associé
            source_type TEXT,    -- Type PyAirbyte (postgres, mysql, csv, gcs, s3...)
            path TEXT,           -- Chemin ou connection string
            description TEXT,
            sync_config TEXT,    -- JSON: configuration PyAirbyte
            sync_status TEXT DEFAULT 'pending',  -- pending, running, success, error
            sync_mode TEXT DEFAULT 'full_refresh',  -- full_refresh, incremental
            ingestion_catalog TEXT,  -- JSON: tables sélectionnées pour sync
            last_sync_at TIMESTAMP,
            last_sync_error TEXT,
            is_active INTEGER DEFAULT 1,
            file_size_bytes INTEGER,
            last_modified TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE IF NOT EXISTS kpis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kpi_id TEXT UNIQUE NOT NULL,     -- Slug unique (ex: "total-evaluations")
            title TEXT NOT NULL,             -- Titre du KPI
            sql_value TEXT NOT NULL,         -- Requête pour la valeur actuelle
            sql_trend TEXT,                  -- Requête pour la valeur période précédente
            sql_sparkline TEXT,              -- Requête pour l'historique (12-15 points)
            sparkline_type TEXT DEFAULT 'area',  -- "area" ou "bar"
            footer TEXT,                     -- Texte explicatif
            trend_label TEXT,                -- Ex: "vs mois dernier"
            display_order INTEGER DEFAULT 0,
            is_enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        , invert_trend BOOLEAN DEFAULT FALSE);

CREATE TABLE IF NOT EXISTS llm_costs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER NOT NULL,
            source TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS llm_prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            content TEXT NOT NULL,
            version TEXT DEFAULT 'normal',
            is_active BOOLEAN DEFAULT 0,
            tokens_estimate INTEGER,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(key, version)
        );

CREATE TABLE IF NOT EXISTS llm_providers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            type TEXT NOT NULL,
            base_url TEXT,
            requires_api_key BOOLEAN DEFAULT 1,
            is_enabled BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE IF NOT EXISTS llm_secrets (
            provider_id INTEGER PRIMARY KEY,
            encrypted_api_key BLOB,
            key_hint TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (provider_id) REFERENCES llm_providers(id)
        );

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

CREATE TABLE IF NOT EXISTS saved_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            question TEXT NOT NULL,
            sql_query TEXT NOT NULL,
            chart_config TEXT,  -- JSON: {"type": "bar", "x": "col", "y": "col", "title": "..."}
            message_id INTEGER,  -- Référence au message d'origine (optionnel)
            is_pinned BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, share_token TEXT,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
        );

CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE IF NOT EXISTS "suggested_questions" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    category TEXT,
    icon TEXT,
    display_order INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS synonyms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            column_id INTEGER NOT NULL,
            term TEXT NOT NULL,
            FOREIGN KEY (column_id) REFERENCES columns(id)
        );

CREATE TABLE IF NOT EXISTS tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            datasource_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            row_count INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, is_enabled BOOLEAN DEFAULT 1,
            FOREIGN KEY (datasource_id) REFERENCES datasources(id),
            UNIQUE(datasource_id, name)
        );

CREATE TABLE IF NOT EXISTS widget_cache (
            widget_id TEXT PRIMARY KEY,
            data TEXT NOT NULL,              -- JSON: résultat de la requête SQL
            computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,            -- NULL = pas d'expiration
            FOREIGN KEY (widget_id) REFERENCES widgets(widget_id) ON DELETE CASCADE
        );

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

CREATE INDEX IF NOT EXISTS idx_costs_date ON llm_costs(created_at);

CREATE INDEX IF NOT EXISTS idx_costs_model ON llm_costs(model_id);

CREATE INDEX IF NOT EXISTS idx_costs_source ON llm_costs(source);

CREATE INDEX IF NOT EXISTS idx_jobs_run_id ON catalog_jobs(run_id);

CREATE INDEX IF NOT EXISTS idx_jobs_started ON catalog_jobs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON catalog_jobs(status);

CREATE INDEX IF NOT EXISTS idx_jobs_type ON catalog_jobs(job_type);

CREATE INDEX IF NOT EXISTS idx_prompts_active ON llm_prompts(is_active);

CREATE INDEX IF NOT EXISTS idx_prompts_category ON llm_prompts(category);

CREATE INDEX IF NOT EXISTS idx_prompts_key ON llm_prompts(key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_share_token ON saved_reports(share_token);


-- =============================================
-- DEFAULT DATA
-- =============================================

-- LLM Providers
INSERT OR IGNORE INTO llm_providers (id, name, display_name, type, base_url, requires_api_key, is_enabled, created_at) VALUES (6, 'google', 'Google AI', 'cloud', NULL, '1', '1', '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_providers (id, name, display_name, type, base_url, requires_api_key, is_enabled, created_at) VALUES (7, 'openai', 'OpenAI', 'cloud', NULL, '1', '1', '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_providers (id, name, display_name, type, base_url, requires_api_key, is_enabled, created_at) VALUES (8, 'anthropic', 'Anthropic', 'cloud', NULL, '1', '1', '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_providers (id, name, display_name, type, base_url, requires_api_key, is_enabled, created_at) VALUES (9, 'mistral', 'Mistral AI', 'cloud', NULL, '1', '1', '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_providers (id, name, display_name, type, base_url, requires_api_key, is_enabled, created_at) VALUES (10, 'ollama', 'Ollama', 'self-hosted', NULL, '0', '1', '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_providers (id, name, display_name, type, base_url, requires_api_key, is_enabled, created_at) VALUES (11, 'bedrock', 'AWS Bedrock', 'cloud', NULL, '0', '1', '2026-01-22 00:00:00');

-- LLM Models
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (12, 6, 'gemini-2.0-flash', 'Gemini 2.0 Flash', 1, 1, 1000000, 0.1, 0.4, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (13, 6, 'gemini-2.5-flash', 'Gemini 2.5 Flash', 1, 1, 1000000, 0.3, 2.5, 1, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (14, 6, 'gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 1, 1, 1000000, 0.1, 0.4, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (15, 6, 'gemini-2.5-pro', 'Gemini 2.5 Pro', 1, 1, 1000000, 1.25, 10.0, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (16, 6, 'gemini-3-flash-preview', 'Gemini 3 Flash (Preview)', 1, 1, 1000000, 0.5, 3.0, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (17, 6, 'gemini-3-pro-preview', 'Gemini 3 Pro (Preview)', 1, 1, 1000000, 2.0, 12.0, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (18, 7, 'gpt-4o', 'GPT-4o', 1, 1, 128000, 2.5, 10.0, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (19, 7, 'gpt-4o-mini', 'GPT-4o Mini', 1, 1, 128000, 0.15, 0.6, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (20, 7, 'gpt-4.1', 'GPT-4.1', 1, 1, 1000000, 2.0, 8.0, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (21, 7, 'gpt-4.1-mini', 'GPT-4.1 Mini', 1, 1, 1000000, 0.4, 1.6, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (22, 7, 'o3-mini', 'o3 Mini (Reasoning)', 1, 1, 200000, 1.1, 4.4, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (23, 8, 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 1, 1, 200000, 3.0, 15.0, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (24, 8, 'claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', 1, 1, 200000, 0.8, 4.0, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (25, 8, 'claude-opus-4-20250514', 'Claude Opus 4', 1, 1, 200000, 15.0, 75.0, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (26, 9, 'mistral-large-latest', 'Mistral Large', 1, 1, 128000, 2.0, 6.0, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (27, 9, 'mistral-small-latest', 'Mistral Small', 1, 1, 128000, 0.2, 0.6, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (28, 9, 'codestral-latest', 'Codestral', 1, 1, 256000, 0.3, 0.9, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (29, 10, 'llama3.2', 'Llama 3.2 (Local)', 1, 1, 128000, NULL, NULL, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (30, 10, 'mistral', 'Mistral (Local)', 1, 1, 32000, NULL, NULL, 0, 1, '2026-01-11 15:21:08');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (31, 10, 'qwen2.5-coder', 'Qwen 2.5 Coder (Local)', 1, 1, 128000, NULL, NULL, 0, 1, '2026-01-11 15:21:08');
-- AWS Bedrock Models
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (32, 11, 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0', 'Claude 3.5 Sonnet v2 (Bedrock)', 1, 1, 200000, 3.0, 15.0, 0, 1, '2026-01-22 00:00:00');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (33, 11, 'bedrock/anthropic.claude-3-5-haiku-20241022-v1:0', 'Claude 3.5 Haiku (Bedrock)', 1, 1, 200000, 0.8, 4.0, 0, 1, '2026-01-22 00:00:00');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (34, 11, 'bedrock/anthropic.claude-3-opus-20240229-v1:0', 'Claude 3 Opus (Bedrock)', 1, 1, 200000, 15.0, 75.0, 0, 1, '2026-01-22 00:00:00');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (35, 11, 'bedrock/amazon.titan-text-premier-v1:0', 'Amazon Titan Premier', 1, 0, 32000, 0.5, 1.5, 0, 1, '2026-01-22 00:00:00');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (36, 11, 'bedrock/meta.llama3-1-70b-instruct-v1:0', 'Llama 3.1 70B (Bedrock)', 1, 0, 128000, 0.99, 0.99, 0, 1, '2026-01-22 00:00:00');
INSERT OR IGNORE INTO llm_models (id, provider_id, model_id, display_name, supports_json_mode, supports_structured_output, context_window, cost_per_1m_input, cost_per_1m_output, is_default, is_enabled, created_at) VALUES (37, 11, 'bedrock/meta.llama3-1-8b-instruct-v1:0', 'Llama 3.1 8B (Bedrock)', 1, 0, 128000, 0.22, 0.22, 0, 1, '2026-01-22 00:00:00');

-- LLM Prompts
INSERT OR IGNORE INTO llm_prompts (id, key, name, category, content, version, is_active, tokens_estimate, description, created_at, updated_at) VALUES (9, 'analytics_system', 'Analytics System', 'analytics', 'Assistant analytique SQL. Réponds en français.

{schema}

RÈGLE CRITIQUE - COLONNES ET VALEURS:
- N''utilise QUE les colonnes et tables listées dans le schéma ci-dessus
- Ne JAMAIS inventer de nom de colonne ou de table
- Pour les colonnes ENUM, utilise EXACTEMENT les valeurs listées dans le schéma (ne pas simplifier ou traduire)
- Choisis la table la plus appropriée selon le contexte de la question

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
- GROUP BY: TOUJOURS utiliser l''expression complète, PAS l''alias

RÈGLE CRITIQUE - AGRÉGATION OBLIGATOIRE:
- Pour "distribution", "répartition", "par catégorie", "par type" → TOUJOURS utiliser GROUP BY + COUNT/AVG/SUM
- JAMAIS retourner des lignes individuelles pour ces questions (trop de données = crash frontend)
- Exemple CORRECT: SELECT categorie, AVG(score) FROM table GROUP BY categorie
- Exemple INTERDIT: SELECT categorie, score FROM table (retourne trop de lignes!)

COLONNES DE CONTEXTE (pour requêtes détaillées uniquement):
- Pour les requêtes SANS agrégation (scatter, liste détaillée, exploration):
  * TOUJOURS ajouter LIMIT 500 pour éviter les crashs
  * Inclure des colonnes d''identification si disponibles dans le schéma
  * Ajouter des colonnes de segmentation si disponibles
- Objectif: permettre à l''utilisateur de comprendre CHAQUE ligne du résultat
- Limite: 6-10 colonnes max pour la lisibilité

MULTI-SÉRIES (OBLIGATOIRE pour "par catégorie", "par type", "couleur par X"):
INTERDIT: GROUP BY avec colonne catégorie qui retourne plusieurs lignes par date.
OBLIGATOIRE: Utiliser FILTER pour PIVOTER les données (une colonne par catégorie).

RÉPONSE: Un seul objet JSON (pas de tableau):
{{"sql":"SELECT...","message":"Explication...","chart":{{"type":"...","x":"col","y":"col|[cols]","title":"..."}}}}', 'v3', 1, 750, 'Prompt système pour l''analyse Text-to-SQL. V3: règle agrégation obligatoire.', '2026-01-17 00:11:14', '2026-01-17 00:11:14');
INSERT OR IGNORE INTO llm_prompts (id, key, name, category, content, version, is_active, tokens_estimate, description, created_at, updated_at) VALUES (3, 'catalog_enrichment', 'Catalog Enrichment', 'catalog', 'Tu es un expert en data catalog. Analyse cette structure de base de données et génère des descriptions sémantiques.

STRUCTURE À DOCUMENTER:
{tables_context}

INSTRUCTIONS:
- Déduis le contexte métier à partir des noms et des exemples de valeurs
- Génère des descriptions claires en français
- Pour chaque colonne, propose 2-3 synonymes (termes alternatifs pour recherche NLP)
- Descriptions concises mais complètes', 'normal', 1, 200, 'Génération de descriptions sémantiques pour le catalogue. Placeholder {tables_context}.', '2026-01-11 18:56:07', '2026-01-11 22:38:21');
INSERT OR IGNORE INTO llm_prompts (id, key, name, category, content, version, is_active, tokens_estimate, description, created_at, updated_at) VALUES (7, 'catalog_questions', 'Génération Questions Suggérées', 'catalog', 'Analyse le schéma de données suivant et génère **8 questions métier pertinentes** que l''utilisateur pourrait poser.

**IMPORTANT - Privilégier les visualisations graphiques:**
- 60% des questions doivent **impérativement** générer des graphiques (tendances, comparaisons, distributions)
- 40% peuvent être des tableaux ou métriques simples
- Éviter les questions qui retournent un seul nombre

**Types de questions à favoriser:**
1. **Évolutions temporelles** (line charts): "Évolution de X par jour/mois/année"
2. **Comparaisons** (bar charts): "Top 10 X par Y", "Répartition de X par catégorie"
3. **Distributions** (histograms): "Distribution des X par tranche de Y"
4. **Corrélations** (scatter plots): "Relation entre X et Y"
5. **Heatmaps**: "X par Y et Z" (matrices de corrélation)

**Types de questions à éviter:**
- Questions retournant un seul nombre ("Quelle est la moyenne de X?")
- Questions yes/no
- Listes brutes sans agrégation

**Format de réponse (JSON):**
```json
{{
  "questions": [
    {{
      "question": "Question en français naturel",
      "category": "Tendances|Performance|Satisfaction|Exploration",
      "icon": "📈|🏆|⭐|🔍",
      "visualization_type": "line|bar|pie|scatter|heatmap|table"
    }}
  ]
}}
```

**Schéma des données:**
{schema}

**Exemples de bonnes questions (orientées graphiques):**
- "Évolution du chiffre d''affaires par mois" → line chart
- "Top 10 des produits les plus vendus" → bar chart
- "Répartition des clients par segment" → pie chart
- "Corrélation entre prix et quantité vendue" → scatter plot
- "Ventes par produit et par région" → heatmap

Génère maintenant 8 questions variées et pertinentes pour ce schéma.', 'v1', 1, NULL, 'Génère des questions analytiques pertinentes basées sur le catalogue enrichi', '2026-01-12 19:04:48', '2026-01-12 20:53:56');
INSERT OR IGNORE INTO llm_prompts (id, key, name, category, content, version, is_active, tokens_estimate, description, created_at, updated_at) VALUES (6, 'widgets_generation', 'Widgets Generation', 'widgets', 'Tu es un analyste métier expert. Génère exactement 4 KPIs pour ce dashboard.

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
{{
  "kpis": [
    {{
      "id": "total-evaluations",
      "title": "Total Évaluations",
      "sql_value": "SELECT COUNT(*) AS value FROM evaluations",
      "sql_trend": "SELECT COUNT(*) AS value FROM evaluations WHERE dat_course < ''2024-05-15''",
      "sql_sparkline": "SELECT COUNT(*) AS value FROM evaluations GROUP BY DATE_TRUNC(''day'', dat_course) ORDER BY DATE_TRUNC(''day'', dat_course) LIMIT 15",
      "sparkline_type": "area",
      "footer": "Mai 2024",
      "trend_label": "vs 1ère quinzaine",
      "invert_trend": false
    }},
    ...
  ]
}}

CONSIGNES:
- Génère EXACTEMENT 4 KPIs pertinents pour le métier détecté
- Choisis des métriques business importantes (volumes, moyennes, ratios, taux)
- Adapte les requêtes trend à la période disponible (compare 1ère moitié vs total)
- Varie les sparkline_type (2 "area" et 2 "bar")
- footer doit indiquer la période des données
- IMPORTANT: Mets invert_trend=true pour les KPIs où une baisse est POSITIVE (taux d''insatisfaction, erreurs, réclamations, temps d''attente...)
', 'normal', 1, 800, 'Génération des widgets et questions suggérées. Placeholder {schema}.', '2026-01-11 19:55:31', '2026-01-11 22:38:21');

-- Data migrations: Fix NULL source_type on legacy datasources
UPDATE datasources SET source_type = type WHERE source_type IS NULL OR source_type = '';

-- Migration: Remove UNIQUE constraint on datasources.name (allow same name in different datasets)
-- SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we recreate the table
CREATE TABLE IF NOT EXISTS datasources_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    dataset_id TEXT,
    source_type TEXT,
    path TEXT,
    description TEXT,
    sync_config TEXT,
    sync_status TEXT DEFAULT 'pending',
    sync_mode TEXT DEFAULT 'full_refresh',
    ingestion_catalog TEXT,
    last_sync_at TIMESTAMP,
    last_sync_error TEXT,
    is_active INTEGER DEFAULT 1,
    file_size_bytes INTEGER,
    last_modified TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Only migrate if the old table has the UNIQUE constraint (check if new table is empty)
INSERT OR IGNORE INTO datasources_new SELECT * FROM datasources WHERE (SELECT COUNT(*) FROM datasources_new) = 0;

-- Drop old table and rename new one (only if migration was successful)
DROP TABLE IF EXISTS datasources_old;
ALTER TABLE datasources RENAME TO datasources_old;
ALTER TABLE datasources_new RENAME TO datasources;
DROP TABLE IF EXISTS datasources_old;

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_datasources_dataset ON datasources(dataset_id);
