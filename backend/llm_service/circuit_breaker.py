"""
Circuit breaker pour protéger contre le spam LLM.

États:
- CLOSED: Normal, requêtes autorisées
- OPEN: Trop d'erreurs, requêtes bloquées pendant cooldown
- HALF_OPEN: Test d'une requête après cooldown
"""

import logging
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)


class CircuitBreaker:
    """
    Circuit breaker simple pour protéger contre le spam LLM.

    Usage:
        if not circuit_breaker.allow_request():
            raise LLMError(LLMErrorCode.SERVICE_UNAVAILABLE)
        try:
            result = call_llm(...)
            circuit_breaker.record_success()
        except Exception:
            circuit_breaker.record_failure()
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        cooldown_seconds: int = 60,
        half_open_max_calls: int = 1,
    ):
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self.half_open_max_calls = half_open_max_calls

        self._failures = 0
        self._last_failure_time: float | None = None
        self._state = "CLOSED"
        self._half_open_calls = 0
        self._lock = threading.Lock()

    def allow_request(self) -> bool:
        """Vérifie si une requête est autorisée."""
        with self._lock:
            if self._state == "CLOSED":
                return True

            if self._state == "OPEN":
                # Vérifier si le cooldown est passé
                if self._last_failure_time and (
                    time.time() - self._last_failure_time > self.cooldown_seconds
                ):
                    self._state = "HALF_OPEN"
                    self._half_open_calls = 0
                    logger.info("Circuit breaker: OPEN -> HALF_OPEN")
                    return True
                return False

            # HALF_OPEN: autoriser un nombre limité de requêtes
            if self._half_open_calls < self.half_open_max_calls:
                self._half_open_calls += 1
                return True
            return False

    def record_success(self) -> None:
        """Enregistre un succès."""
        with self._lock:
            if self._state == "HALF_OPEN":
                # Succès en half-open = retour à closed
                self._state = "CLOSED"
                self._failures = 0
                logger.info("Circuit breaker: HALF_OPEN -> CLOSED")
            elif self._state == "CLOSED":
                # Reset progressif des failures
                self._failures = max(0, self._failures - 1)

    def record_failure(self) -> None:
        """Enregistre un échec."""
        with self._lock:
            self._failures += 1
            self._last_failure_time = time.time()

            if self._state == "HALF_OPEN":
                # Échec en half-open = retour à open
                self._state = "OPEN"
                logger.warning("Circuit breaker: HALF_OPEN -> OPEN (failure)")
            elif self._state == "CLOSED" and self._failures >= self.failure_threshold:
                # Trop d'échecs = ouverture
                self._state = "OPEN"
                logger.warning(
                    "Circuit breaker: CLOSED -> OPEN (threshold=%d)",
                    self.failure_threshold,
                )

    def get_status(self) -> dict[str, Any]:
        """Retourne le statut du circuit breaker."""
        with self._lock:
            return {
                "state": self._state,
                "failures": self._failures,
                "threshold": self.failure_threshold,
                "cooldown_seconds": self.cooldown_seconds,
            }

    def reset(self) -> None:
        """Reset manuel du circuit breaker."""
        with self._lock:
            self._failures = 0
            self._state = "CLOSED"
            self._last_failure_time = None
            self._half_open_calls = 0
            logger.info("Circuit breaker: manual reset")


# Instance globale du circuit breaker
_circuit_breaker = CircuitBreaker(
    failure_threshold=5,  # 5 erreurs consécutives
    cooldown_seconds=60,  # 1 minute de pause
    half_open_max_calls=1,  # 1 requête test
)


def get_circuit_breaker_status() -> dict[str, Any]:
    """Retourne le statut du circuit breaker (pour /health)."""
    return _circuit_breaker.get_status()


def reset_circuit_breaker() -> None:
    """Reset le circuit breaker (pour admin)."""
    _circuit_breaker.reset()
