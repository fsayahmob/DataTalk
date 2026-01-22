"""
Filtres pour exclure les éléments internes du catalogue.

Centralise la logique d'exclusion des tables et colonnes système
(PyAirbyte, DLT, etc.) pour éviter la duplication.
"""

# Préfixes des tables et colonnes internes à exclure
EXCLUDED_PREFIXES = ("_airbyte_", "_dlt_", "__")


def is_internal_table(table_name: str) -> bool:
    """Vérifie si une table est interne (Airbyte, DLT, système)."""
    return any(table_name.startswith(prefix) for prefix in EXCLUDED_PREFIXES)


def is_internal_column(col_name: str) -> bool:
    """Vérifie si une colonne est interne (Airbyte, DLT, système)."""
    return any(col_name.startswith(prefix) for prefix in EXCLUDED_PREFIXES)
