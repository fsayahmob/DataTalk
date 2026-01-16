"""
Tests unitaires pour les endpoints API critiques.

Utilise pytest + httpx pour tester FastAPI de manière asynchrone.
"""

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from main import app


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Client HTTP asynchrone pour tester l'API."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# =============================================================================
# HEALTH & STATUS
# =============================================================================


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient) -> None:
    """Test GET /health retourne status ok ou degraded."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["ok", "degraded"]
    assert "components" in data
    assert "response_time_ms" in data


@pytest.mark.asyncio
async def test_database_status(client: AsyncClient) -> None:
    """Test GET /database/status retourne l'état de la connexion."""
    response = await client.get("/database/status")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] in ["connected", "disconnected"]


# =============================================================================
# CONVERSATIONS
# =============================================================================


@pytest.mark.asyncio
async def test_list_conversations(client: AsyncClient) -> None:
    """Test GET /conversations retourne une liste wrappée."""
    response = await client.get("/conversations")
    assert response.status_code == 200
    data = response.json()
    assert "conversations" in data
    assert isinstance(data["conversations"], list)


@pytest.mark.asyncio
async def test_create_conversation(client: AsyncClient) -> None:
    """Test POST /conversations crée une nouvelle conversation."""
    response = await client.post("/conversations", json={"title": "Test conversation"})
    assert response.status_code == 200
    data = response.json()
    assert "id" in data


@pytest.mark.asyncio
async def test_get_conversation_messages(client: AsyncClient) -> None:
    """Test GET /conversations/{id}/messages retourne les messages."""
    # Créer une conversation d'abord
    create_response = await client.post("/conversations", json={"title": "Test"})
    conv_id = create_response.json()["id"]

    # Récupérer les messages
    response = await client.get(f"/conversations/{conv_id}/messages")
    assert response.status_code == 200
    data = response.json()
    assert "messages" in data
    assert isinstance(data["messages"], list)


@pytest.mark.asyncio
async def test_delete_conversation(client: AsyncClient) -> None:
    """Test DELETE /conversations/{id} supprime une conversation."""
    # Créer une conversation
    create_response = await client.post("/conversations", json={"title": "To delete"})
    conv_id = create_response.json()["id"]

    # Supprimer
    response = await client.delete(f"/conversations/{conv_id}")
    assert response.status_code == 200

    # Vérifier qu'elle n'existe plus (messages vides)
    messages_response = await client.get(f"/conversations/{conv_id}/messages")
    data = messages_response.json()
    assert data.get("messages", []) == []


# =============================================================================
# SETTINGS
# =============================================================================


@pytest.mark.asyncio
async def test_get_settings(client: AsyncClient) -> None:
    """Test GET /settings retourne la configuration."""
    response = await client.get("/settings")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_setting_by_key(client: AsyncClient) -> None:
    """Test GET /settings/{key} retourne une valeur spécifique."""
    # Tester avec une clé qui existe (default_model_id par exemple)
    response = await client.get("/settings/default_model_id")
    # Peut être 200 ou 404 selon si la clé existe
    assert response.status_code in [200, 404]


@pytest.mark.asyncio
async def test_update_setting(client: AsyncClient) -> None:
    """Test PUT /settings met à jour les settings."""
    # Récupérer les settings actuels
    get_response = await client.get("/settings")
    current_settings = get_response.json()

    # Mettre à jour avec les mêmes valeurs (test que l'endpoint fonctionne)
    response = await client.put("/settings", json=current_settings)
    assert response.status_code == 200


# =============================================================================
# CATALOG
# =============================================================================


@pytest.mark.asyncio
async def test_get_catalog(client: AsyncClient) -> None:
    """Test GET /catalog retourne le catalogue sémantique."""
    response = await client.get("/catalog")
    assert response.status_code == 200
    data = response.json()
    assert "catalog" in data
    assert isinstance(data["catalog"], list)


# =============================================================================
# REPORTS
# =============================================================================


@pytest.mark.asyncio
async def test_list_reports(client: AsyncClient) -> None:
    """Test GET /reports retourne la liste des rapports wrappée."""
    response = await client.get("/reports")
    assert response.status_code == 200
    data = response.json()
    assert "reports" in data
    assert isinstance(data["reports"], list)


@pytest.mark.asyncio
async def test_create_and_delete_report(client: AsyncClient) -> None:
    """Test POST /reports crée un rapport, DELETE le supprime."""
    # Créer
    report_data = {
        "title": "Test Report",
        "question": "Test question?",
        "sql_query": "SELECT 1",
        "chart_config": None,
    }
    create_response = await client.post("/reports", json=report_data)
    assert create_response.status_code == 200
    report = create_response.json()
    assert "id" in report
    report_id = report["id"]

    # Supprimer
    delete_response = await client.delete(f"/reports/{report_id}")
    assert delete_response.status_code == 200


# =============================================================================
# LLM PROVIDERS
# =============================================================================


@pytest.mark.asyncio
async def test_list_llm_providers(client: AsyncClient) -> None:
    """Test GET /llm/providers retourne les providers disponibles."""
    response = await client.get("/llm/providers")
    assert response.status_code == 200
    data = response.json()
    assert "providers" in data
    assert isinstance(data["providers"], list)


@pytest.mark.asyncio
async def test_list_llm_models(client: AsyncClient) -> None:
    """Test GET /llm/models retourne les modèles disponibles."""
    response = await client.get("/llm/models")
    assert response.status_code == 200
    data = response.json()
    assert "models" in data
    assert isinstance(data["models"], list)
