"""
Catalogue sémantique SQLite pour stocker les métadonnées des tables/colonnes.
Permet de générer dynamiquement le contexte pour le LLM.

NOTE: Les tables sont définies dans schema.sql (source unique de vérité).
      Utiliser db.init_db() pour initialiser la base.
"""
from typing import Any, Optional

from db import get_connection


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
    is_primary_key: bool = False,
    full_context: str | None = None
) -> int | None:
    """Ajoute une colonne au catalogue."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO columns
        (table_id, name, data_type, description, sample_values, value_range, is_primary_key, full_context, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (table_id, name, data_type, description, sample_values, value_range, is_primary_key, full_context))
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


def get_schema_for_llm(datasource_name: Optional[str] = None) -> str:
    """
    Génère le schéma formaté pour le contexte LLM (text-to-SQL).

    Lit le setting 'catalog_context_mode' pour déterminer le format:
    - "compact": schéma simple (nom, type, description)
    - "full": schéma enrichi avec full_context (stats, ENUM, distribution)
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Lire le mode de contexte depuis les settings
    cursor.execute("SELECT value FROM settings WHERE key = 'catalog_context_mode'")
    mode_row = cursor.fetchone()
    use_full = (mode_row and mode_row['value'] == 'full')

    # Récupérer les datasources
    if datasource_name:
        cursor.execute("SELECT * FROM datasources WHERE name = ?", (datasource_name,))
    else:
        cursor.execute("SELECT * FROM datasources")

    datasources = cursor.fetchall()

    schema_parts = []

    for ds in datasources:
        # Récupérer les tables activées uniquement
        cursor.execute("""
            SELECT * FROM tables WHERE datasource_id = ? AND is_enabled = 1
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
                col_line = f"- {col['name']} ({col['data_type']})"

                if col['description']:
                    # Tronquer description longue
                    desc = col['description'][:80] + "..." if len(col['description'] or "") > 80 else col['description']
                    col_line += f": {desc}"

                if use_full and col['full_context']:
                    # Mode FULL: ajouter le full_context (stats calculées à l'extraction)
                    col_line += f" | {col['full_context']}"
                elif col['value_range']:
                    # Mode COMPACT ou pas de full_context: juste le range
                    col_line += f" [{col['value_range']}]"

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

def get_setting(key: str, default: str | None = None) -> str | None:
    """Récupère une valeur de configuration."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        result = cursor.fetchone()
        return result["value"] if result else default
    finally:
        conn.close()


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


# ========================================
# FONCTIONS CRUD - TABLES (ENABLE/DISABLE)
# ========================================

def toggle_table_enabled(table_id: int) -> bool:
    """Inverse l'état is_enabled d'une table."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE tables
        SET is_enabled = NOT is_enabled, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (table_id,))
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def set_table_enabled(table_id: int, enabled: bool) -> bool:
    """Définit l'état is_enabled d'une table."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE tables
        SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (enabled, table_id))
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def get_table_by_id(table_id: int) -> dict | None:
    """Récupère une table par son ID."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tables WHERE id = ?", (table_id,))
    result = cursor.fetchone()
    conn.close()
    return dict(result) if result else None


# ========================================
# FONCTIONS CRUD - CATALOG JOBS
# ========================================

def create_catalog_job(
    job_type: str,
    run_id: str,
    total_steps: int,
    details: Optional[dict[str, Any]] = None
) -> int:
    """
    Crée un nouveau job de catalogue (extraction ou enrichment).

    Args:
        job_type: 'extraction' ou 'enrichment'
        run_id: UUID de la run (commun pour extraction + enrichment)
        total_steps: Nombre total de steps calculé dynamiquement
        details: Contexte JSON (batch size, mode, etc.)

    Returns:
        ID du job créé
    """
    import json

    conn = get_connection()
    try:
        cursor = conn.cursor()

        details_json = json.dumps(details) if details else None

        cursor.execute("""
            INSERT INTO catalog_jobs (job_type, run_id, status, total_steps, details)
            VALUES (?, ?, 'pending', ?, ?)
        """, (job_type, run_id, total_steps, details_json))

        conn.commit()
        job_id = cursor.lastrowid
        assert job_id is not None
        return job_id
    finally:
        conn.close()


def update_job_status(
    job_id: int,
    status: str,
    current_step: Optional[str] = None,
    step_index: Optional[int] = None,
    error_message: Optional[str] = None
):
    """
    Met à jour le statut d'un job.

    Args:
        job_id: ID du job
        status: 'pending', 'running', 'completed', 'failed'
        current_step: Nom du step actuel (ex: "llm_batch_2")
        step_index: Index du step (0-based)
        error_message: Message d'erreur si status='failed'
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Calculer le progress si step_index fourni
        if step_index is not None:
            cursor.execute("SELECT total_steps FROM catalog_jobs WHERE id = ?", (job_id,))
            row = cursor.fetchone()
            if row and row['total_steps']:
                progress = int((step_index + 1) / row['total_steps'] * 100)
            else:
                progress = 0

            cursor.execute("""
                UPDATE catalog_jobs
                SET status = ?, current_step = ?, step_index = ?, progress = ?,
                    error_message = ?, completed_at = CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
                WHERE id = ?
            """, (status, current_step, step_index, progress, error_message, status, job_id))
        else:
            cursor.execute("""
                UPDATE catalog_jobs
                SET status = ?, current_step = ?, error_message = ?,
                    completed_at = CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
                WHERE id = ?
            """, (status, current_step, error_message, status, job_id))

        conn.commit()
    finally:
        conn.close()


def update_job_result(job_id: int, result: dict[str, Any]):
    """
    Met à jour le résultat JSON d'un job complété.

    Args:
        job_id: ID du job
        result: Dictionnaire avec les métriques (tables, columns, synonyms, kpis, questions)
    """
    import json

    conn = get_connection()
    try:
        cursor = conn.cursor()

        result_json = json.dumps(result)
        cursor.execute("UPDATE catalog_jobs SET result = ? WHERE id = ?", (result_json, job_id))

        conn.commit()
    finally:
        conn.close()


def get_catalog_job(job_id: int) -> dict | None:
    """Récupère un job par son ID."""
    import json

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM catalog_jobs WHERE id = ?", (job_id,))
        result = cursor.fetchone()

        if not result:
            return None

        job = dict(result)

        # Parser les champs JSON
        if job.get('details'):
            try:
                job['details'] = json.loads(job['details'])
            except Exception:
                pass

        if job.get('result'):
            try:
                job['result'] = json.loads(job['result'])
            except Exception:
                pass

        return job
    finally:
        conn.close()


def get_catalog_jobs(limit: int = 50) -> list[dict]:
    """
    Récupère l'historique des jobs (plus récents en premier).

    Args:
        limit: Nombre max de jobs à retourner

    Returns:
        Liste des jobs avec leurs détails
    """
    import json

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM catalog_jobs
            ORDER BY started_at DESC
            LIMIT ?
        """, (limit,))

        results = [dict(row) for row in cursor.fetchall()]

        # Parser les champs JSON
        for job in results:
            if job.get('details'):
                try:
                    job['details'] = json.loads(job['details'])
                except Exception:
                    pass

            if job.get('result'):
                try:
                    job['result'] = json.loads(job['result'])
                except Exception:
                    pass

        return results
    finally:
        conn.close()


def get_run_jobs(run_id: str) -> list[dict]:
    """
    Récupère tous les jobs d'une run (extraction + enrichments).

    Args:
        run_id: UUID de la run

    Returns:
        Liste ordonnée: [extraction_job, enrichment_job, ...]
    """
    import json

    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Récupérer tous les jobs de cette run
        cursor.execute("""
            SELECT * FROM catalog_jobs
            WHERE run_id = ?
            ORDER BY started_at ASC
        """, (run_id,))

        jobs = [dict(row) for row in cursor.fetchall()]

        # Parser JSON pour tous les jobs
        for job in jobs:
            if job.get('details'):
                try:
                    job['details'] = json.loads(job['details'])
                except Exception:
                    pass

            if job.get('result'):
                try:
                    job['result'] = json.loads(job['result'])
                except Exception:
                    pass

        return jobs
    finally:
        conn.close()


def get_latest_run_id() -> str | None:
    """
    Récupère le run_id de la dernière extraction.

    Returns:
        run_id ou None si aucune run
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT run_id FROM catalog_jobs
            WHERE job_type = 'extraction'
            ORDER BY id DESC
            LIMIT 1
        """)

        row = cursor.fetchone()
        return row['run_id'] if row else None
    finally:
        conn.close()


# ========================================
# WORKFLOW MANAGER - Pattern Pro
# ========================================

class WorkflowManager:
    """
    Gestionnaire de workflow qui garantit la mise à jour du statut avant/après chaque étape.

    Usage:
        workflow = WorkflowManager(job_id=123, total_steps=5)

        with workflow.step("extract_metadata"):
            # Faire le travail
            result = extract_metadata()

        with workflow.step("save_catalog"):
            # Faire le travail
            save_catalog(result)
    """

    def __init__(self, job_id: int, total_steps: int):
        self.job_id = job_id
        self.total_steps = total_steps
        self.current_step_index = 0

    def step(self, name: str):
        """Retourne un context manager pour une étape du workflow."""
        return WorkflowStep(self, name)


class WorkflowStep:
    """Context manager pour une étape de workflow."""

    def __init__(self, manager: WorkflowManager, name: str):
        self.manager = manager
        self.name = name

    def __enter__(self):
        """Marque l'étape comme 'running' AVANT son exécution."""
        update_job_status(
            job_id=self.manager.job_id,
            status="running",
            current_step=self.name,
            step_index=self.manager.current_step_index
        )
        print(f"[WORKFLOW] Step {self.manager.current_step_index + 1}/{self.manager.total_steps}: {self.name}")
        return self

    def __exit__(self, exc_type, exc_val, _exc_tb):
        """
        Gère la fin de l'étape.
        - Si succès: incrémente le step_index
        - Si erreur: marque le job comme 'failed'
        """
        if exc_type is None:
            # Succès: passer à l'étape suivante
            self.manager.current_step_index += 1
        else:
            # Erreur: marquer le job comme failed
            error_msg = f"{exc_type.__name__}: {str(exc_val)[:200]}"
            update_job_status(
                job_id=self.manager.job_id,
                status="failed",
                error_message=error_msg
            )
            print(f"[WORKFLOW] ✗ Step failed: {error_msg}")

        # Ne pas supprimer l'exception (return None = propagate)
        return False


