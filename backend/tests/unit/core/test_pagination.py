"""Tests pour core/pagination.py - Pagination standardisée."""

import pytest

from core.pagination import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    paginate_response,
    validate_pagination,
)


class TestValidatePagination:
    """Tests de validate_pagination."""

    def test_default_values_when_none(self) -> None:
        """Utilise les valeurs par défaut quand None."""
        limit, offset = validate_pagination(None, None)
        assert limit == DEFAULT_LIMIT
        assert offset == 0

    def test_respects_valid_limit(self) -> None:
        """Respecte une limite valide."""
        limit, offset = validate_pagination(10, 0)
        assert limit == 10

    def test_caps_limit_at_max(self) -> None:
        """Limite cappée à MAX_LIMIT."""
        limit, offset = validate_pagination(500, 0)
        assert limit == MAX_LIMIT

    def test_limit_zero_becomes_default(self) -> None:
        """Limite 0 devient DEFAULT_LIMIT (falsy)."""
        limit, offset = validate_pagination(0, 0)
        assert limit == DEFAULT_LIMIT  # 0 is falsy, so uses DEFAULT_LIMIT

    def test_negative_limit_becomes_one(self) -> None:
        """Limite négative devient 1."""
        limit, offset = validate_pagination(-5, 0)
        assert limit == 1

    def test_respects_valid_offset(self) -> None:
        """Respecte un offset valide."""
        limit, offset = validate_pagination(10, 20)
        assert offset == 20

    def test_negative_offset_becomes_zero(self) -> None:
        """Offset négatif devient 0."""
        limit, offset = validate_pagination(10, -10)
        assert offset == 0

    def test_large_offset_preserved(self) -> None:
        """Grand offset préservé."""
        limit, offset = validate_pagination(10, 1000000)
        assert offset == 1000000


class TestPaginateResponse:
    """Tests de paginate_response."""

    def test_basic_pagination(self) -> None:
        """Structure de base de la réponse paginée."""
        items = [1, 2, 3]
        result = paginate_response(items, total=10, limit=3, offset=0)

        assert result["items"] == items
        assert "pagination" in result
        assert result["pagination"]["limit"] == 3
        assert result["pagination"]["offset"] == 0
        assert result["pagination"]["total"] == 10

    def test_has_more_true(self) -> None:
        """has_more est True quand il reste des éléments."""
        items = [1, 2, 3]
        result = paginate_response(items, total=10, limit=3, offset=0)
        assert result["pagination"]["has_more"] is True

    def test_has_more_false_at_end(self) -> None:
        """has_more est False à la fin."""
        items = [8, 9, 10]
        result = paginate_response(items, total=10, limit=3, offset=7)
        assert result["pagination"]["has_more"] is False

    def test_has_more_false_exact_end(self) -> None:
        """has_more est False quand offset + len(items) == total."""
        items = [1, 2, 3, 4, 5]
        result = paginate_response(items, total=5, limit=10, offset=0)
        assert result["pagination"]["has_more"] is False

    def test_empty_items(self) -> None:
        """Gère une liste vide."""
        result = paginate_response([], total=0, limit=10, offset=0)
        assert result["items"] == []
        assert result["pagination"]["has_more"] is False

    def test_partial_last_page(self) -> None:
        """Gère une dernière page partielle."""
        items = [9, 10]  # Dernière page avec 2 éléments sur une limite de 5
        result = paginate_response(items, total=10, limit=5, offset=8)
        assert result["pagination"]["has_more"] is False


class TestConstants:
    """Tests des constantes."""

    def test_max_limit_is_reasonable(self) -> None:
        """MAX_LIMIT est raisonnable."""
        assert MAX_LIMIT == 100

    def test_default_limit_is_reasonable(self) -> None:
        """DEFAULT_LIMIT est raisonnable."""
        assert DEFAULT_LIMIT == 20
        assert DEFAULT_LIMIT <= MAX_LIMIT
