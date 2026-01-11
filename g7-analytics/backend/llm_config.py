"""
Configuration LLM pour G7 Analytics.
Gère les providers, modèles, secrets (chiffrés) et tracking des coûts.
"""
from typing import Optional

from crypto import decrypt, encrypt
from db import get_connection

# ========================================
# INITIALISATION DES TABLES
# ========================================

def init_llm_tables():
    """Crée les tables LLM si elles n'existent pas."""
    conn = get_connection()
    cursor = conn.cursor()

    # Table des providers LLM
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS llm_providers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            type TEXT NOT NULL,
            base_url TEXT,
            requires_api_key BOOLEAN DEFAULT 1,
            is_enabled BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Table des modèles LLM
    cursor.execute("""
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
        )
    """)

    # Table des secrets (clés API chiffrées)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS llm_secrets (
            provider_id INTEGER PRIMARY KEY,
            encrypted_api_key BLOB,
            key_hint TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (provider_id) REFERENCES llm_providers(id)
        )
    """)

    # Table des coûts (historique des appels)
    cursor.execute("""
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
        )
    """)

    # Index pour les requêtes de stats
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_costs_model ON llm_costs(model_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_costs_date ON llm_costs(created_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_costs_source ON llm_costs(source)")

    # Table des prompts LLM (stockage centralisé)
    cursor.execute("""
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
        )
    """)

    # Index pour les prompts
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_prompts_key ON llm_prompts(key)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_prompts_category ON llm_prompts(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_prompts_active ON llm_prompts(is_active)")

    conn.commit()
    conn.close()


# ========================================
# CRUD PROVIDERS
# ========================================

# Endpoints de health check pour les providers self-hosted
SELFHOSTED_HEALTH_ENDPOINTS = {
    "ollama": "/api/tags",  # Sera préfixé par base_url
}


def check_local_provider_available(provider_name: str) -> bool:
    """
    Vérifie si un provider self-hosted est accessible.
    Utilise base_url de la DB + endpoint de health check.
    """
    import urllib.error
    import urllib.request

    # Récupérer le provider pour avoir son base_url
    provider = get_provider_by_name(provider_name)
    if not provider:
        return False

    base_url = provider.get("base_url")
    if not base_url:
        return False

    # Construire l'URL de health check
    health_endpoint = SELFHOSTED_HEALTH_ENDPOINTS.get(provider_name, "/health")
    url = base_url.rstrip("/") + health_endpoint

    try:
        req = urllib.request.Request(url, method="GET")  # noqa: S310
        with urllib.request.urlopen(req, timeout=2):  # noqa: S310
            return True
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def get_providers(enabled_only: bool = True) -> list[dict]:
    """Récupère la liste des providers."""
    conn = get_connection()
    cursor = conn.cursor()
    if enabled_only:
        cursor.execute("SELECT * FROM llm_providers WHERE is_enabled = 1 ORDER BY display_name")
    else:
        cursor.execute("SELECT * FROM llm_providers ORDER BY display_name")
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def get_provider(provider_id: int) -> Optional[dict]:
    """Récupère un provider par ID."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM llm_providers WHERE id = ?", (provider_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_provider_by_name(name: str) -> Optional[dict]:
    """Récupère un provider par nom."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM llm_providers WHERE name = ?", (name,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_provider_base_url(provider_id: int, base_url: Optional[str]) -> bool:
    """Met à jour le base_url d'un provider (pour self-hosted)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE llm_providers SET base_url = ? WHERE id = ?
    """, (base_url.rstrip("/") if base_url else None, provider_id))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


# ========================================
# CRUD MODELS
# ========================================

def get_models(provider_id: Optional[int] = None, enabled_only: bool = True) -> list[dict]:
    """Récupère la liste des modèles."""
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        SELECT m.*, p.name as provider_name, p.display_name as provider_display_name
        FROM llm_models m
        JOIN llm_providers p ON m.provider_id = p.id
        WHERE 1=1
    """
    params = []

    if enabled_only:
        query += " AND m.is_enabled = 1 AND p.is_enabled = 1"
    if provider_id:
        query += " AND m.provider_id = ?"
        params.append(provider_id)

    query += " ORDER BY p.display_name, m.display_name"

    cursor.execute(query, params)
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def get_model(model_id: int) -> Optional[dict]:
    """Récupère un modèle par ID."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT m.*, p.name as provider_name, p.display_name as provider_display_name,
               p.base_url, p.requires_api_key
        FROM llm_models m
        JOIN llm_providers p ON m.provider_id = p.id
        WHERE m.id = ?
    """, (model_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_default_model() -> Optional[dict]:
    """Récupère le modèle par défaut."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT m.*, p.name as provider_name, p.display_name as provider_display_name,
               p.base_url, p.requires_api_key
        FROM llm_models m
        JOIN llm_providers p ON m.provider_id = p.id
        WHERE m.is_default = 1 AND m.is_enabled = 1 AND p.is_enabled = 1
    """)
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_model_by_model_id(model_id: str) -> Optional[dict]:
    """Récupère un modèle par son model_id (ex: 'gemini-2.0-flash')."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT m.*, p.name as provider_name, p.display_name as provider_display_name,
               p.base_url, p.requires_api_key
        FROM llm_models m
        JOIN llm_providers p ON m.provider_id = p.id
        WHERE m.model_id = ?
    """, (model_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def set_default_model(model_id: str) -> bool:
    """Définit un modèle comme défaut par son model_id (ex: 'gemini-2.0-flash')."""
    conn = get_connection()
    cursor = conn.cursor()

    # Récupérer l'id interne du modèle
    cursor.execute("SELECT id FROM llm_models WHERE model_id = ?", (model_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False

    internal_id = row["id"]

    # Enlever le défaut actuel
    cursor.execute("UPDATE llm_models SET is_default = 0")
    # Mettre le nouveau défaut
    cursor.execute("UPDATE llm_models SET is_default = 1 WHERE id = ?", (internal_id,))
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


# ========================================
# CRUD SECRETS (chiffrement AES)
# ========================================

def set_api_key(provider_id: int, api_key: str) -> bool:
    """Sauvegarde une clé API (chiffrée) pour un provider."""
    conn = get_connection()
    cursor = conn.cursor()

    # Si clé vide, supprimer l'entrée
    if not api_key or not api_key.strip():
        cursor.execute("DELETE FROM llm_secrets WHERE provider_id = ?", (provider_id,))
        conn.commit()
        conn.close()
        return True

    # Chiffrer la clé
    encrypted_key = encrypt(api_key)

    # Masquer la clé pour l'affichage
    if len(api_key) > 8:
        key_hint = api_key[:4] + "..." + api_key[-4:]
    else:
        key_hint = "***"

    cursor.execute("""
        INSERT OR REPLACE INTO llm_secrets (provider_id, encrypted_api_key, key_hint, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    """, (provider_id, encrypted_key, key_hint))

    conn.commit()
    conn.close()
    return True


def get_api_key(provider_id: int) -> Optional[str]:
    """Récupère la clé API (déchiffrée) pour un provider depuis la base."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT encrypted_api_key FROM llm_secrets WHERE provider_id = ?", (provider_id,))
    row = cursor.fetchone()
    conn.close()

    if row and row["encrypted_api_key"]:
        return decrypt(row["encrypted_api_key"])

    return None


def has_api_key(provider_id: int) -> bool:
    """Vérifie si une clé API est configurée pour un provider."""
    return get_api_key(provider_id) is not None


def get_api_key_hint(provider_id: int) -> Optional[str]:
    """Récupère l'indice de la clé API (ex: AIza...xyz)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key_hint FROM llm_secrets WHERE provider_id = ?", (provider_id,))
    row = cursor.fetchone()
    conn.close()
    return row["key_hint"] if row else None


# ========================================
# CRUD COSTS (tracking)
# ========================================

def log_cost(
    model_id: int,
    source: str,
    tokens_input: int,
    tokens_output: int,
    response_time_ms: Optional[int] = None,
    conversation_id: Optional[int] = None,
    success: bool = True,
    error_message: Optional[str] = None
) -> int:
    """Enregistre un appel LLM avec son coût."""
    # Récupérer les coûts du modèle
    model = get_model(model_id)
    cost_input = 0.0
    cost_output = 0.0

    if model:
        if model.get("cost_per_1m_input"):
            cost_input = tokens_input * model["cost_per_1m_input"] / 1_000_000
        if model.get("cost_per_1m_output"):
            cost_output = tokens_output * model["cost_per_1m_output"] / 1_000_000

    cost_total = cost_input + cost_output

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO llm_costs
        (model_id, source, conversation_id, tokens_input, tokens_output,
         cost_input, cost_output, cost_total, response_time_ms, success, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (model_id, source, conversation_id, tokens_input, tokens_output,
          cost_input, cost_output, cost_total, response_time_ms, success, error_message))

    conn.commit()
    cost_id = cursor.lastrowid
    assert cost_id is not None
    conn.close()
    return cost_id


def get_total_costs(days: int = 30, model_id: Optional[int] = None, source: Optional[str] = None) -> dict:
    """Récupère les coûts totaux pour les N derniers jours."""
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        SELECT
            COUNT(*) as total_calls,
            SUM(tokens_input) as total_tokens_input,
            SUM(tokens_output) as total_tokens_output,
            SUM(cost_total) as total_cost
        FROM llm_costs
        WHERE success = 1 AND created_at >= datetime('now', ?)
    """
    params: list[int | str] = [f"-{days} days"]

    if model_id:
        query += " AND model_id = ?"
        params.append(model_id)
    if source:
        query += " AND source = ?"
        params.append(source)

    cursor.execute(query, params)
    row = cursor.fetchone()
    conn.close()

    return {
        "total_calls": row["total_calls"] or 0,
        "total_tokens_input": row["total_tokens_input"] or 0,
        "total_tokens_output": row["total_tokens_output"] or 0,
        "total_cost": row["total_cost"] or 0.0
    }


def get_costs_by_period(days: int = 30) -> list[dict]:
    """Récupère les coûts par jour sur les N derniers jours."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            DATE(created_at) as date,
            COUNT(*) as calls,
            SUM(tokens_input) as tokens_input,
            SUM(tokens_output) as tokens_output,
            SUM(cost_total) as cost
        FROM llm_costs
        WHERE success = 1 AND created_at >= DATE('now', ?)
        GROUP BY DATE(created_at)
        ORDER BY date DESC
    """, (f"-{days} days",))

    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def get_costs_by_hour(days: int = 7) -> list[dict]:
    """Récupère les coûts par heure sur les N derniers jours."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            strftime('%Y-%m-%d %H:00', created_at) as hour,
            COUNT(*) as calls,
            SUM(tokens_input) as tokens_input,
            SUM(tokens_output) as tokens_output,
            SUM(cost_total) as cost
        FROM llm_costs
        WHERE success = 1 AND created_at >= datetime('now', ?)
        GROUP BY strftime('%Y-%m-%d %H:00', created_at)
        ORDER BY hour DESC
    """, (f"-{days} days",))

    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def get_costs_by_model(days: int = 30) -> list[dict]:
    """Récupère les coûts groupés par modèle pour les N derniers jours."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            m.display_name as model_name,
            p.display_name as provider_name,
            COUNT(*) as calls,
            SUM(c.tokens_input) as tokens_input,
            SUM(c.tokens_output) as tokens_output,
            SUM(c.cost_total) as cost
        FROM llm_costs c
        JOIN llm_models m ON c.model_id = m.id
        JOIN llm_providers p ON m.provider_id = p.id
        WHERE c.success = 1
          AND c.created_at >= datetime('now', ?)
        GROUP BY c.model_id
        ORDER BY cost DESC
    """, (f'-{days} days',))

    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


# ========================================
# CRUD PROMPTS
# ========================================

def get_prompts(category: Optional[str] = None, active_only: bool = False) -> list[dict]:
    """Récupère la liste des prompts."""
    conn = get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM llm_prompts WHERE 1=1"
    params: list[str] = []

    if category:
        query += " AND category = ?"
        params.append(category)
    if active_only:
        query += " AND is_active = 1"

    query += " ORDER BY category, key, version"

    cursor.execute(query, params)
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def get_prompt(key: str, version: str = "normal") -> Optional[dict]:
    """Récupère un prompt par clé et version."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM llm_prompts WHERE key = ? AND version = ?",
        (key, version)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_active_prompt(key: str) -> Optional[dict]:
    """Récupère le prompt actif pour une clé donnée."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM llm_prompts WHERE key = ? AND is_active = 1",
        (key,)
    )
    row = cursor.fetchone()
    conn.close()

    # Fallback: si aucun prompt actif, prendre la version "normal"
    if not row:
        return get_prompt(key, "normal")

    return dict(row) if row else None


def add_prompt(
    key: str,
    name: str,
    category: str,
    content: str,
    version: str = "normal",
    is_active: bool = False,
    tokens_estimate: Optional[int] = None,
    description: Optional[str] = None
) -> Optional[int]:
    """Ajoute un nouveau prompt."""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO llm_prompts
            (key, name, category, content, version, is_active, tokens_estimate, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (key, name, category, content, version, is_active, tokens_estimate, description))
        conn.commit()
        prompt_id = cursor.lastrowid
        conn.close()
        return prompt_id
    except Exception:
        conn.close()
        return None


def update_prompt(
    prompt_id: int,
    content: Optional[str] = None,
    name: Optional[str] = None,
    tokens_estimate: Optional[int] = None,
    description: Optional[str] = None
) -> bool:
    """Met à jour un prompt existant."""
    conn = get_connection()
    cursor = conn.cursor()

    updates = []
    params: list[str | int] = []

    if content is not None:
        updates.append("content = ?")
        params.append(content)
    if name is not None:
        updates.append("name = ?")
        params.append(name)
    if tokens_estimate is not None:
        updates.append("tokens_estimate = ?")
        params.append(tokens_estimate)
    if description is not None:
        updates.append("description = ?")
        params.append(description)

    if not updates:
        conn.close()
        return False

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(prompt_id)

    cursor.execute(
        f"UPDATE llm_prompts SET {', '.join(updates)} WHERE id = ?",
        params
    )
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


def set_active_prompt(key: str, version: str) -> bool:
    """Active une version de prompt (désactive les autres versions de la même clé)."""
    conn = get_connection()
    cursor = conn.cursor()

    # Vérifier que le prompt existe
    cursor.execute(
        "SELECT id FROM llm_prompts WHERE key = ? AND version = ?",
        (key, version)
    )
    if not cursor.fetchone():
        conn.close()
        return False

    # Désactiver tous les prompts de cette clé
    cursor.execute("UPDATE llm_prompts SET is_active = 0 WHERE key = ?", (key,))

    # Activer la version demandée
    cursor.execute(
        "UPDATE llm_prompts SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE key = ? AND version = ?",
        (key, version)
    )

    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


def delete_prompt(prompt_id: int) -> bool:
    """Supprime un prompt."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM llm_prompts WHERE id = ?", (prompt_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


if __name__ == "__main__":
    init_llm_tables()
    print("Tables LLM créées avec succès!")
