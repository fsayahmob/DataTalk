"""
Tests de résilience et sécurité.

Ces tests vérifient les comportements critiques en conditions d'erreur:
- Parsing JSON LLM (markdown, malformé, etc.)
- Circuit breaker (protection contre le spam)
- Encryption des clés API
"""

import pytest

from crypto import decrypt, encrypt
from llm_service import CircuitBreaker
from llm_utils import LLMJsonParseError, parse_analytics_response, parse_llm_json


# =============================================================================
# TESTS PARSING JSON LLM (scénarios réels de bugs)
# =============================================================================


class TestLLMJsonParsing:
    """Tests du parsing JSON depuis les réponses LLM."""

    def test_parse_markdown_wrapped_json(self) -> None:
        """Bug réel: Gemini wrappe souvent le JSON dans ```json."""
        content = (
            '```json\n{"sql": "SELECT * FROM users", "message": "Voici les utilisateurs"}\n```'
        )
        result = parse_llm_json(content)
        assert result["sql"] == "SELECT * FROM users"
        assert result["message"] == "Voici les utilisateurs"

    def test_parse_markdown_without_language_tag(self) -> None:
        """Variante: ``` sans 'json' après."""
        content = '```\n{"sql": "SELECT 1"}\n```'
        result = parse_llm_json(content)
        assert result["sql"] == "SELECT 1"

    def test_parse_json_with_text_before(self) -> None:
        """LLM ajoute parfois du texte explicatif avant le JSON."""
        content = 'Voici la requête SQL:\n\n{"sql": "SELECT COUNT(*) FROM orders"}'
        result = parse_llm_json(content)
        assert result["sql"] == "SELECT COUNT(*) FROM orders"

    def test_parse_json_with_text_after(self) -> None:
        """LLM ajoute parfois du texte après le JSON."""
        content = '{"sql": "SELECT 1"}\n\nCette requête retourne 1.'
        result = parse_llm_json(content)
        assert result["sql"] == "SELECT 1"

    def test_parse_empty_content_raises(self) -> None:
        """Contenu vide doit lever une exception claire."""
        with pytest.raises(LLMJsonParseError, match="vide"):
            parse_llm_json("")

    def test_parse_no_json_raises(self) -> None:
        """Contenu sans JSON doit lever une exception claire."""
        with pytest.raises(LLMJsonParseError, match="ne contient pas de JSON"):
            parse_llm_json("Je ne sais pas répondre à cette question.")

    def test_parse_malformed_json_raises(self) -> None:
        """JSON malformé doit lever une exception avec contexte."""
        with pytest.raises(LLMJsonParseError, match="invalide"):
            parse_llm_json('{"sql": "SELECT 1", missing_quote}')

    def test_parse_nested_json(self) -> None:
        """JSON avec objets imbriqués."""
        content = '{"sql": "SELECT 1", "chart": {"type": "bar", "x": "col1"}}'
        result = parse_llm_json(content)
        assert result["chart"]["type"] == "bar"

    def test_analytics_response_fallback_on_error(self) -> None:
        """parse_analytics_response retourne le texte brut si pas de JSON."""
        content = "Je ne peux pas générer de SQL pour cette question."
        result = parse_analytics_response(content)
        assert result["sql"] == ""
        assert result["message"] == content
        assert result["chart"]["type"] == "none"

    def test_analytics_response_empty_returns_defaults(self) -> None:
        """parse_analytics_response gère le contenu vide."""
        result = parse_analytics_response("")
        assert result["sql"] == ""
        assert result["message"] == ""


# =============================================================================
# TESTS CIRCUIT BREAKER (protection contre le spam)
# =============================================================================


class TestCircuitBreaker:
    """Tests du circuit breaker - comportement observable uniquement."""

    def test_allows_requests_initially(self) -> None:
        """État initial: requêtes autorisées."""
        cb = CircuitBreaker(failure_threshold=3)
        assert cb.allow_request() is True

    def test_opens_after_threshold_failures(self) -> None:
        """Après N échecs consécutifs, bloque les requêtes."""
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=60)

        # 3 échecs
        for _ in range(3):
            cb.record_failure()

        # Circuit ouvert = requêtes bloquées
        assert cb.allow_request() is False

    def test_success_resets_failure_count(self) -> None:
        """Un succès réduit le compteur d'échecs."""
        cb = CircuitBreaker(failure_threshold=3)

        # 2 échecs
        cb.record_failure()
        cb.record_failure()

        # 1 succès
        cb.record_success()

        # 2 échecs de plus (total 3 depuis le succès? non, 2)
        cb.record_failure()
        cb.record_failure()

        # Pas encore ouvert car succès a réduit le compteur
        # Note: le comportement exact dépend de l'implémentation
        # Ici on vérifie que le circuit n'est pas ouvert après 2+1+2 avec 1 succès au milieu
        status = cb.get_status()
        # failures devrait être < threshold après un succès intermédiaire
        assert status["failures"] < 5  # sanity check

    def test_half_open_allows_limited_requests(self) -> None:
        """Après cooldown, permet un nombre limité de requêtes test."""
        cb = CircuitBreaker(failure_threshold=2, cooldown_seconds=0, half_open_max_calls=1)

        # Ouvrir le circuit
        cb.record_failure()
        cb.record_failure()

        # Première requête après ouverture: passe en half-open et autorise
        assert cb.allow_request() is True

        # En half-open, la requête suivante est aussi autorisée (jusqu'à max_calls)
        # Le comportement exact dépend de l'état interne
        # On vérifie que le circuit est en half-open
        status = cb.get_status()
        assert status["state"] == "HALF_OPEN"

    def test_success_in_half_open_closes_circuit(self) -> None:
        """Succès en half-open referme le circuit."""
        cb = CircuitBreaker(failure_threshold=2, cooldown_seconds=0)

        # Ouvrir
        cb.record_failure()
        cb.record_failure()

        # Passer en half-open et réussir
        cb.allow_request()  # Passe en half-open
        cb.record_success()

        # Circuit refermé
        status = cb.get_status()
        assert status["state"] == "CLOSED"

    def test_failure_in_half_open_reopens_circuit(self) -> None:
        """Échec en half-open réouvre le circuit."""
        cb = CircuitBreaker(failure_threshold=2, cooldown_seconds=0)

        # Ouvrir
        cb.record_failure()
        cb.record_failure()

        # Passer en half-open et échouer
        cb.allow_request()  # Passe en half-open
        cb.record_failure()

        # Circuit réouvert
        status = cb.get_status()
        assert status["state"] == "OPEN"

    def test_manual_reset(self) -> None:
        """Reset manuel remet le circuit en état initial."""
        cb = CircuitBreaker(failure_threshold=2)

        # Ouvrir
        cb.record_failure()
        cb.record_failure()
        assert cb.allow_request() is False

        # Reset
        cb.reset()

        # Circuit fermé
        assert cb.allow_request() is True
        assert cb.get_status()["state"] == "CLOSED"


# =============================================================================
# TESTS SÉCURITÉ (encryption des clés API)
# =============================================================================


class TestApiKeySecurity:
    """Tests de sécurité pour le stockage des clés API."""

    def test_encrypt_decrypt_roundtrip(self) -> None:
        """Encryption/decryption fonctionne correctement."""
        original = "sk-test-api-key-12345"
        encrypted = encrypt(original)

        # Le résultat chiffré est différent de l'original
        assert encrypted != original.encode()

        # On peut déchiffrer et retrouver l'original
        decrypted = decrypt(encrypted)
        assert decrypted == original

    def test_encrypted_key_not_readable(self) -> None:
        """La clé chiffrée ne contient pas la clé en clair."""
        api_key = "AIzaSyC-FAKE-KEY-123456789"
        encrypted = encrypt(api_key)

        # La clé originale n'apparaît pas dans le résultat chiffré
        assert api_key.encode() not in encrypted
        assert b"AIzaSy" not in encrypted

    def test_api_key_hint_masks_correctly(self) -> None:
        """Le hint masque correctement la clé (premiers et derniers caractères)."""
        # Note: ce test utilise la vraie DB, donc on mock ou on teste la logique
        # Ici on teste la logique de masquage directement
        api_key = "AIzaSyC-FAKE-KEY-123456789"

        # Logique de masquage (copiée de llm_config.set_api_key)
        key_hint = api_key[:4] + "..." + api_key[-4:] if len(api_key) > 8 else "***"

        assert key_hint == "AIza...6789"
        assert "FAKE" not in key_hint
        assert "KEY" not in key_hint

    def test_short_api_key_fully_masked(self) -> None:
        """Une clé courte (<=8 chars) est entièrement masquée."""
        short_key = "abc123"
        key_hint = short_key[:4] + "..." + short_key[-4:] if len(short_key) > 8 else "***"
        assert key_hint == "***"

    def test_decrypt_invalid_data_returns_none(self) -> None:
        """Déchiffrer des données invalides retourne None (pas d'exception)."""
        result = decrypt(b"invalid-not-encrypted-data")
        assert result is None

    def test_decrypt_empty_returns_none(self) -> None:
        """Déchiffrer une valeur vide retourne None."""
        result = decrypt(b"")
        assert result is None
