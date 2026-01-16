"""
Types partagés et utilitaires pour le backend.

Ce fichier centralise les type aliases et fonctions de conversion
pour améliorer la type safety et éviter la duplication de code.
"""

from typing import Any, TypeAlias

import duckdb
import numpy as np
import pandas as pd

# Connexion DuckDB - utilisé partout dans catalog_engine et autres
DuckDBConnection: TypeAlias = duckdb.DuckDBPyConnection

# Types JSON courants
JsonDict: TypeAlias = dict[str, "JsonValue"]
JsonList: TypeAlias = list["JsonValue"]
JsonValue: TypeAlias = str | int | float | bool | None | JsonDict | JsonList

# Types pour les résultats SQL
SqlScalar: TypeAlias = str | int | float | bool | None
SqlRow: TypeAlias = dict[str, SqlScalar]
SqlResult: TypeAlias = list[SqlRow]

# Types pour les KPIs
KpiValue: TypeAlias = str | int | float
SparklineData: TypeAlias = list[int | float]


# =============================================================================
# CONVERSION PANDAS → JSON
# =============================================================================


def convert_pandas_value(value: Any) -> Any:
    """
    Convertit une valeur Pandas/Numpy en type JSON-sérialisable.

    Gère:
    - pd.Timestamp → ISO string
    - np.datetime64 → string
    - np.int64/float64 → Python int/float
    - date/datetime/time → string
    - NaN/NaT → None
    """
    # Pandas Timestamp
    if isinstance(value, pd.Timestamp):
        return value.isoformat() if not pd.isna(value) else None
    # Numpy datetime64
    if isinstance(value, np.datetime64):
        return str(value) if not pd.isna(value) else None
    # Numpy types (int64, float64, etc.)
    if hasattr(value, "item"):
        return value.item()
    # Python date/datetime/time
    if str(type(value).__name__) in ("date", "datetime", "time"):
        return str(value)
    # NaN/NaT values
    if pd.isna(value):
        return None
    return value


def convert_df_to_json(df: pd.DataFrame) -> list[dict[str, Any]]:
    """
    Convertit un DataFrame Pandas en liste de dicts JSON-sérialisables.

    Usage:
        result = conn.execute(sql).fetchdf()
        data = convert_df_to_json(result)
    """
    data: list[dict[str, Any]] = df.to_dict(orient="records")
    for row in data:
        for key, value in row.items():
            row[key] = convert_pandas_value(value)
    return data
