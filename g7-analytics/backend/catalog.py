"""
Catalogue sémantique SQLite pour stocker les métadonnées des tables/colonnes.
Permet de générer dynamiquement le contexte pour le LLM.
"""
from typing import Any, Optional

from db import CATALOG_PATH, get_connection


def init_catalog():
    """Initialise le schéma du catalogue."""
    conn = get_connection()
    cursor = conn.cursor()

    # Table des sources de données
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS datasources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL,  -- 'duckdb', 'postgres', 'mysql', etc.
            path TEXT,           -- Chemin ou connection string
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Table des tables
    cursor.execute("""
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
        )
    """)

    # Table des colonnes
    cursor.execute("""
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
        )
    """)

    # Table des synonymes (pour le NLP)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS synonyms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            column_id INTEGER NOT NULL,
            term TEXT NOT NULL,
            FOREIGN KEY (column_id) REFERENCES columns(id)
        )
    """)

    # Table des relations entre tables
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_column_id INTEGER NOT NULL,
            to_column_id INTEGER NOT NULL,
            relationship_type TEXT NOT NULL,  -- '1:1', '1:N', 'N:N'
            FOREIGN KEY (from_column_id) REFERENCES columns(id),
            FOREIGN KEY (to_column_id) REFERENCES columns(id)
        )
    """)

    # ========================================
    # TABLES POUR L'INTERFACE UTILISATEUR
    # ========================================

    # Table des conversations (sessions de chat)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,  -- Généré automatiquement depuis la première question
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Table des messages (questions + réponses dans une conversation)
    cursor.execute("""
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
        )
    """)

    # Table des rapports sauvegardés (favoris - Zone 3)
    cursor.execute("""
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
        )
    """)

    # Table de configuration (clé API, préférences)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ========================================
    # TABLES POUR LES WIDGETS DYNAMIQUES
    # ========================================

    # Table des widgets (générés par LLM lors de la création du catalogue)
    cursor.execute("""
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
        )
    """)

    # Cache des résultats des widgets (évite 100 clients = 100 requêtes identiques)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS widget_cache (
            widget_id TEXT PRIMARY KEY,
            data TEXT NOT NULL,              -- JSON: résultat de la requête SQL
            computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,            -- NULL = pas d'expiration
            FOREIGN KEY (widget_id) REFERENCES widgets(widget_id) ON DELETE CASCADE
        )
    """)

    # Table des questions suggérées (générées par LLM)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS suggested_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            category TEXT,                   -- "Performance", "Tendances", "Alertes", etc.
            icon TEXT,                       -- Emoji
            business_value TEXT,             -- Pourquoi poser cette question
            display_order INTEGER DEFAULT 0,
            is_enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Table des KPIs (générés par LLM - structure KpiCompactData)
    cursor.execute("""
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
        )
    """)

    conn.commit()
    conn.close()
    print(f"Catalogue initialisé: {CATALOG_PATH}")


def add_datasource(name: str, type: str, path: str | None = None, description: str | None = None) -> int | None:
    """Ajoute une source de données."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO datasources (name, type, path, description, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (name, type, path, description))
    conn.commit()
    datasource_id = cursor.lastrowid
    conn.close()
    return datasource_id


def add_table(datasource_id: int, name: str, description: str | None = None, row_count: int | None = None) -> int | None:
    """Ajoute une table au catalogue."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO tables (datasource_id, name, description, row_count, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (datasource_id, name, description, row_count))
    conn.commit()
    table_id = cursor.lastrowid
    conn.close()
    return table_id


def add_column(
    table_id: int,
    name: str,
    data_type: str,
    description: str | None = None,
    sample_values: str | None = None,
    value_range: str | None = None,
    is_primary_key: bool = False
) -> int | None:
    """Ajoute une colonne au catalogue."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO columns
        (table_id, name, data_type, description, sample_values, value_range, is_primary_key, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (table_id, name, data_type, description, sample_values, value_range, is_primary_key))
    conn.commit()
    column_id = cursor.lastrowid
    conn.close()
    return column_id


def add_synonym(column_id: int, term: str):
    """Ajoute un synonyme pour une colonne."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO synonyms (column_id, term) VALUES (?, ?)", (column_id, term))
    conn.commit()
    conn.close()


def get_schema_for_llm(datasource_name: Optional[str] = None, compact: bool = True) -> str:
    """
    Génère le schéma formaté pour le contexte LLM.
    compact=True: schéma optimisé pour réduire les tokens (pas de sample_values)
    compact=False: schéma complet avec exemples
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Récupérer les datasources
    if datasource_name:
        cursor.execute("SELECT * FROM datasources WHERE name = ?", (datasource_name,))
    else:
        cursor.execute("SELECT * FROM datasources")

    datasources = cursor.fetchall()

    schema_parts = []

    for ds in datasources:
        # Récupérer les tables
        cursor.execute("""
            SELECT * FROM tables WHERE datasource_id = ?
        """, (ds['id'],))
        tables = cursor.fetchall()

        for table in tables:
            table_desc = f"Table: {table['name']}"
            if table['row_count']:
                table_desc += f" ({table['row_count']:,} lignes)"

            schema_parts.append(table_desc)

            # Récupérer les colonnes
            cursor.execute("""
                SELECT * FROM columns WHERE table_id = ?
            """, (table['id'],))
            columns = cursor.fetchall()

            for col in columns:
                if compact:
                    # Format compact: nom (type): description [range]
                    col_line = f"- {col['name']} ({col['data_type']})"
                    if col['description']:
                        # Tronquer description longue
                        desc = col['description'][:80] + "..." if len(col['description'] or "") > 80 else col['description']
                        col_line += f": {desc}"
                    if col['value_range']:
                        col_line += f" [{col['value_range']}]"
                else:
                    # Format complet avec exemples
                    col_line = f"- {col['name']} ({col['data_type']})"
                    if col['description']:
                        col_line += f": {col['description']}"
                    if col['value_range']:
                        col_line += f" [Valeurs: {col['value_range']}]"
                    if col['sample_values']:
                        col_line += f" [Ex: {col['sample_values']}]"
                schema_parts.append(col_line)

            schema_parts.append("")  # Ligne vide entre tables

    conn.close()
    return "\n".join(schema_parts)


def get_table_info(table_name: str) -> dict[str, Any] | None:
    """Récupère les infos d'une table."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT t.*, d.name as datasource_name
        FROM tables t
        JOIN datasources d ON t.datasource_id = d.id
        WHERE t.name = ?
    """, (table_name,))
    result = cursor.fetchone()
    conn.close()
    return dict(result) if result else None


# ========================================
# FONCTIONS CRUD - CONVERSATIONS
# ========================================

def create_conversation(title: Optional[str] = None) -> int:
    """Crée une nouvelle conversation."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO conversations (title) VALUES (?)",
        (title,)
    )
    conn.commit()
    conversation_id = cursor.lastrowid
    assert conversation_id is not None, "INSERT should always return a lastrowid"
    conn.close()
    return conversation_id


def get_conversations(limit: int = 20) -> list[dict]:
    """Récupère les conversations récentes."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.*,
               (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
        FROM conversations c
        ORDER BY c.updated_at DESC
        LIMIT ?
    """, (limit,))
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def delete_conversation(conversation_id: int) -> bool:
    """Supprime une conversation et ses messages."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def delete_all_conversations() -> int:
    """Supprime toutes les conversations et leurs messages.

    Returns:
        Nombre de conversations supprimées.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM conversations")
    conn.commit()
    deleted_count = cursor.rowcount
    conn.close()
    return deleted_count


# ========================================
# FONCTIONS CRUD - MESSAGES
# ========================================

def add_message(
    conversation_id: int,
    role: str,
    content: str,
    sql_query: Optional[str] = None,
    chart_config: Optional[str] = None,
    data_json: Optional[str] = None,
    model_name: Optional[str] = None,
    tokens_input: Optional[int] = None,
    tokens_output: Optional[int] = None,
    response_time_ms: Optional[int] = None
) -> int:
    """Ajoute un message à une conversation."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO messages
        (conversation_id, role, content, sql_query, chart_config, data_json,
         model_name, tokens_input, tokens_output, response_time_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (conversation_id, role, content, sql_query, chart_config, data_json,
          model_name, tokens_input, tokens_output, response_time_ms))

    # Mettre à jour le timestamp de la conversation
    cursor.execute(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (conversation_id,)
    )

    # Mettre à jour le titre si c'est le premier message user
    if role == "user":
        cursor.execute(
            "UPDATE conversations SET title = ? WHERE id = ? AND title IS NULL",
            (content[:50] + "..." if len(content) > 50 else content, conversation_id)
        )

    conn.commit()
    message_id = cursor.lastrowid
    assert message_id is not None, "INSERT should always return a lastrowid"
    conn.close()
    return message_id


def get_messages(conversation_id: int) -> list[dict]:
    """Récupère tous les messages d'une conversation.

    Renomme les champs pour correspondre au format attendu par le frontend:
    - sql_query -> sql
    - chart_config -> chart (JSON parsé)
    - data_json -> data (JSON parsé)
    """
    import json

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
    """, (conversation_id,))
    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        msg = dict(row)
        # Renommer et parser les champs pour le frontend
        msg["sql"] = msg.pop("sql_query", None)

        # Parser chart_config JSON
        chart_config = msg.pop("chart_config", None)
        if chart_config:
            try:
                msg["chart"] = json.loads(chart_config)
            except (json.JSONDecodeError, TypeError):
                msg["chart"] = None
        else:
            msg["chart"] = None

        # Parser data_json
        data_json = msg.pop("data_json", None)
        if data_json:
            try:
                msg["data"] = json.loads(data_json)
            except (json.JSONDecodeError, TypeError):
                msg["data"] = None
        else:
            msg["data"] = None

        results.append(msg)

    return results


# ========================================
# FONCTIONS CRUD - RAPPORTS SAUVEGARDÉS
# ========================================

def save_report(
    title: str,
    question: str,
    sql_query: str,
    chart_config: Optional[str] = None,
    message_id: Optional[int] = None,
    is_pinned: bool = False
) -> int:
    """Sauvegarde un rapport."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO saved_reports
        (title, question, sql_query, chart_config, message_id, is_pinned)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (title, question, sql_query, chart_config, message_id, is_pinned))
    conn.commit()
    report_id = cursor.lastrowid
    assert report_id is not None, "INSERT should always return a lastrowid"
    conn.close()
    return report_id


def get_saved_reports() -> list[dict]:
    """Récupère tous les rapports sauvegardés."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM saved_reports
        ORDER BY is_pinned DESC, created_at DESC
    """)
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def delete_report(report_id: int) -> bool:
    """Supprime un rapport sauvegardé."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM saved_reports WHERE id = ?", (report_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def toggle_pin_report(report_id: int) -> bool:
    """Inverse l'état épinglé d'un rapport."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE saved_reports
        SET is_pinned = NOT is_pinned
        WHERE id = ?
    """, (report_id,))
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


# ========================================
# FONCTIONS CRUD - SETTINGS
# ========================================

def get_setting(key: str) -> str | None:
    """Récupère une valeur de configuration."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    result = cursor.fetchone()
    conn.close()
    return result["value"] if result else None


def set_setting(key: str, value: str):
    """Définit une valeur de configuration."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
    """, (key, value))
    conn.commit()
    conn.close()


def get_all_settings() -> dict:
    """Récupère toutes les configurations."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    results = {row["key"]: row["value"] for row in cursor.fetchall()}
    conn.close()
    return results


# ========================================
# FONCTIONS CRUD - WIDGETS
# ========================================

def add_widget(
    widget_id: str,
    title: str,
    sql_query: str,
    chart_type: str,
    description: Optional[str] = None,
    icon: Optional[str] = None,
    chart_config: Optional[str] = None,
    display_order: int = 0,
    priority: str = "normal"
) -> int:
    """Ajoute un widget."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO widgets
        (widget_id, title, description, icon, sql_query, chart_type, chart_config, display_order, priority, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (widget_id, title, description, icon, sql_query, chart_type, chart_config, display_order, priority))
    conn.commit()
    row_id = cursor.lastrowid
    assert row_id is not None
    conn.close()
    return row_id


def get_widgets(enabled_only: bool = True) -> list[dict]:
    """Récupère tous les widgets."""
    conn = get_connection()
    cursor = conn.cursor()
    if enabled_only:
        cursor.execute("""
            SELECT * FROM widgets
            WHERE is_enabled = TRUE
            ORDER BY priority DESC, display_order ASC
        """)
    else:
        cursor.execute("SELECT * FROM widgets ORDER BY priority DESC, display_order ASC")
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def delete_all_widgets():
    """Supprime tous les widgets (avant régénération)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM widget_cache")
    cursor.execute("DELETE FROM widgets")
    conn.commit()
    conn.close()


# ========================================
# FONCTIONS CRUD - WIDGET CACHE
# ========================================

def get_widget_cache(widget_id: str) -> dict | None:
    """Récupère le cache d'un widget."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM widget_cache
        WHERE widget_id = ?
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    """, (widget_id,))
    result = cursor.fetchone()
    conn.close()
    return dict(result) if result else None


def set_widget_cache(widget_id: str, data: str, ttl_minutes: Optional[int] = None):
    """Met en cache le résultat d'un widget."""
    conn = get_connection()
    cursor = conn.cursor()
    if ttl_minutes:
        cursor.execute("""
            INSERT OR REPLACE INTO widget_cache (widget_id, data, computed_at, expires_at)
            VALUES (?, ?, CURRENT_TIMESTAMP, datetime(CURRENT_TIMESTAMP, '+' || ? || ' minutes'))
        """, (widget_id, data, ttl_minutes))
    else:
        cursor.execute("""
            INSERT OR REPLACE INTO widget_cache (widget_id, data, computed_at, expires_at)
            VALUES (?, ?, CURRENT_TIMESTAMP, NULL)
        """, (widget_id, data))
    conn.commit()
    conn.close()


def clear_widget_cache():
    """Vide tout le cache des widgets."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM widget_cache")
    conn.commit()
    conn.close()


# ========================================
# FONCTIONS CRUD - SUGGESTED QUESTIONS
# ========================================

def add_suggested_question(
    question: str,
    category: Optional[str] = None,
    icon: Optional[str] = None,
    business_value: Optional[str] = None,
    display_order: int = 0
) -> int:
    """Ajoute une question suggérée."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO suggested_questions (question, category, icon, business_value, display_order)
        VALUES (?, ?, ?, ?, ?)
    """, (question, category, icon, business_value, display_order))
    conn.commit()
    question_id = cursor.lastrowid
    assert question_id is not None
    conn.close()
    return question_id


def get_suggested_questions(enabled_only: bool = True) -> list[dict]:
    """Récupère les questions suggérées."""
    conn = get_connection()
    cursor = conn.cursor()
    if enabled_only:
        cursor.execute("""
            SELECT * FROM suggested_questions
            WHERE is_enabled = TRUE
            ORDER BY category, display_order
        """)
    else:
        cursor.execute("SELECT * FROM suggested_questions ORDER BY category, display_order")
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def delete_all_suggested_questions():
    """Supprime toutes les questions suggérées (avant régénération)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM suggested_questions")
    conn.commit()
    conn.close()


if __name__ == "__main__":
    # Test: initialiser le catalogue
    init_catalog()
    print("Catalogue créé avec succès!")
