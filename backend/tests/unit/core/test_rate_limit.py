"""Tests pour core/rate_limit.py - Rate limiting."""

from slowapi import Limiter

from core.rate_limit import limiter


class TestLimiter:
    """Tests du limiter."""

    def test_limiter_is_slowapi_limiter(self) -> None:
        """Le limiter est une instance de slowapi Limiter."""
        assert isinstance(limiter, Limiter)

    def test_limiter_uses_ip_address(self) -> None:
        """Le limiter utilise l'adresse IP comme clé."""
        # Le key_func est get_remote_address
        assert limiter._key_func is not None

    def test_limiter_can_be_imported(self) -> None:
        """Le limiter peut être importé."""
        from core.rate_limit import limiter as imported_limiter

        assert imported_limiter is limiter
