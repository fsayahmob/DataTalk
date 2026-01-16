"""
Types partagés pour le backend.

Ce fichier centralise les type aliases pour améliorer la type safety
et éviter l'utilisation de Any.
"""

from typing import TypeAlias

import duckdb

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
