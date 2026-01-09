#!/usr/bin/env python3
"""Script pour exécuter des requêtes DuckDB depuis Next.js"""
import sys
import json
import duckdb
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "g7_analytics.duckdb")

def execute_query(sql: str) -> list:
    """Exécute une requête SQL et retourne les résultats en JSON"""
    try:
        con = duckdb.connect(DB_PATH, read_only=True)
        result = con.execute(sql).fetchdf()
        con.close()

        # Convertir en liste de dicts
        data = result.to_dict(orient="records")

        # Gérer les types non sérialisables
        for row in data:
            for key, value in row.items():
                if hasattr(value, 'item'):  # numpy types
                    row[key] = value.item()
                elif str(type(value).__name__) in ('date', 'datetime', 'time'):
                    row[key] = str(value)

        return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "SQL query required"}))
        sys.exit(1)

    sql = sys.argv[1]
    result = execute_query(sql)
    print(json.dumps(result))
