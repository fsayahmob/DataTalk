"""Tests pour llm_service/circuit_breaker.py - Circuit breaker LLM."""

import time
from unittest.mock import patch

import pytest

from llm_service.circuit_breaker import (
    CircuitBreaker,
    _circuit_breaker,
    get_circuit_breaker_status,
    reset_circuit_breaker,
)


class TestCircuitBreakerInit:
    """Tests d'initialisation du CircuitBreaker."""

    def test_default_values(self) -> None:
        """Valeurs par défaut correctes."""
        cb = CircuitBreaker()
        assert cb.failure_threshold == 5
        assert cb.cooldown_seconds == 60
        assert cb.half_open_max_calls == 1

    def test_custom_values(self) -> None:
        """Peut configurer des valeurs personnalisées."""
        cb = CircuitBreaker(
            failure_threshold=3,
            cooldown_seconds=30,
            half_open_max_calls=2,
        )
        assert cb.failure_threshold == 3
        assert cb.cooldown_seconds == 30
        assert cb.half_open_max_calls == 2

    def test_initial_state_closed(self) -> None:
        """État initial est CLOSED."""
        cb = CircuitBreaker()
        assert cb._state == "CLOSED"
        assert cb._failures == 0


class TestAllowRequest:
    """Tests de allow_request."""

    def test_allows_in_closed_state(self) -> None:
        """Autorise les requêtes en état CLOSED."""
        cb = CircuitBreaker()
        assert cb.allow_request() is True

    def test_blocks_in_open_state(self) -> None:
        """Bloque les requêtes en état OPEN."""
        cb = CircuitBreaker(failure_threshold=2)
        cb.record_failure()
        cb.record_failure()
        assert cb._state == "OPEN"
        assert cb.allow_request() is False

    def test_transitions_to_half_open_after_cooldown(self) -> None:
        """Transition OPEN -> HALF_OPEN après cooldown."""
        cb = CircuitBreaker(failure_threshold=1, cooldown_seconds=1)
        cb.record_failure()
        assert cb._state == "OPEN"

        # Simuler le passage du temps
        cb._last_failure_time = time.time() - 2

        assert cb.allow_request() is True
        assert cb._state == "HALF_OPEN"

    def test_half_open_allows_limited_calls(self) -> None:
        """HALF_OPEN autorise un nombre limité de requêtes."""
        cb = CircuitBreaker(failure_threshold=1, half_open_max_calls=2)
        cb.record_failure()
        cb._last_failure_time = time.time() - 100
        cb._state = "HALF_OPEN"
        cb._half_open_calls = 0

        assert cb.allow_request() is True
        assert cb.allow_request() is True
        assert cb.allow_request() is False


class TestRecordSuccess:
    """Tests de record_success."""

    def test_transitions_half_open_to_closed(self) -> None:
        """Succès en HALF_OPEN -> CLOSED."""
        cb = CircuitBreaker()
        cb._state = "HALF_OPEN"
        cb._failures = 3

        cb.record_success()

        assert cb._state == "CLOSED"
        assert cb._failures == 0

    def test_decrements_failures_in_closed(self) -> None:
        """Décremente les failures en état CLOSED."""
        cb = CircuitBreaker()
        cb._failures = 3

        cb.record_success()

        assert cb._failures == 2

    def test_does_not_go_below_zero(self) -> None:
        """Ne descend pas en dessous de 0."""
        cb = CircuitBreaker()
        cb._failures = 0

        cb.record_success()

        assert cb._failures == 0


class TestRecordFailure:
    """Tests de record_failure."""

    def test_increments_failures(self) -> None:
        """Incrémente les failures."""
        cb = CircuitBreaker()
        cb.record_failure()
        assert cb._failures == 1

    def test_opens_at_threshold(self) -> None:
        """Ouvre le circuit au seuil."""
        cb = CircuitBreaker(failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        assert cb._state == "CLOSED"
        cb.record_failure()
        assert cb._state == "OPEN"

    def test_half_open_to_open_on_failure(self) -> None:
        """HALF_OPEN -> OPEN sur failure."""
        cb = CircuitBreaker()
        cb._state = "HALF_OPEN"

        cb.record_failure()

        assert cb._state == "OPEN"

    def test_transient_errors_need_threshold(self) -> None:
        """Erreurs transientes nécessitent plusieurs occurrences."""
        cb = CircuitBreaker(failure_threshold=10)
        cb._transient_threshold = 3

        # 2 erreurs transientes ne comptent pas
        cb.record_failure(is_transient=True)
        cb.record_failure(is_transient=True)
        assert cb._failures == 0

        # 3ème erreur transiente compte comme 1 failure
        cb.record_failure(is_transient=True)
        assert cb._failures == 1

    def test_transient_window_clears_old(self) -> None:
        """La fenêtre glissante nettoie les vieux timestamps."""
        cb = CircuitBreaker()
        cb._transient_window = 1  # 1 seconde

        cb.record_failure(is_transient=True)
        time.sleep(1.1)  # Attendre que la fenêtre expire
        cb.record_failure(is_transient=True)

        # Seule la dernière erreur devrait être dans la fenêtre
        assert len(cb._transient_timestamps) == 1


class TestGetStatus:
    """Tests de get_status."""

    def test_returns_correct_status(self) -> None:
        """Retourne le statut correct."""
        cb = CircuitBreaker(failure_threshold=5, cooldown_seconds=60)
        cb._failures = 2
        cb._state = "CLOSED"

        status = cb.get_status()

        assert status["state"] == "CLOSED"
        assert status["failures"] == 2
        assert status["threshold"] == 5
        assert status["cooldown_seconds"] == 60


class TestReset:
    """Tests de reset."""

    def test_resets_all_state(self) -> None:
        """Reset remet tout à zéro."""
        cb = CircuitBreaker()
        cb._failures = 5
        cb._state = "OPEN"
        cb._last_failure_time = time.time()
        cb._half_open_calls = 3
        cb._transient_timestamps = [1.0, 2.0, 3.0]

        cb.reset()

        assert cb._failures == 0
        assert cb._state == "CLOSED"
        assert cb._last_failure_time is None
        assert cb._half_open_calls == 0
        assert cb._transient_timestamps == []


class TestGlobalFunctions:
    """Tests des fonctions globales."""

    def test_get_circuit_breaker_status(self) -> None:
        """get_circuit_breaker_status retourne le statut."""
        _circuit_breaker.reset()
        status = get_circuit_breaker_status()

        assert "state" in status
        assert "failures" in status
        assert "threshold" in status

    def test_reset_circuit_breaker(self) -> None:
        """reset_circuit_breaker reset l'instance globale."""
        _circuit_breaker._failures = 10
        _circuit_breaker._state = "OPEN"

        reset_circuit_breaker()

        assert _circuit_breaker._failures == 0
        assert _circuit_breaker._state == "CLOSED"


class TestGlobalInstance:
    """Tests de l'instance globale."""

    def test_global_instance_exists(self) -> None:
        """L'instance globale existe."""
        assert _circuit_breaker is not None
        assert isinstance(_circuit_breaker, CircuitBreaker)

    def test_global_instance_defaults(self) -> None:
        """L'instance globale a les bonnes valeurs par défaut."""
        assert _circuit_breaker.failure_threshold == 5
        assert _circuit_breaker.cooldown_seconds == 60
        assert _circuit_breaker.half_open_max_calls == 1
