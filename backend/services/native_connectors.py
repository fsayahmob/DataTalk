"""
Connecteurs natifs Python pour les bases de données courantes.

Ces connecteurs utilisent des drivers Python purs (psycopg2, pymysql) au lieu de
PyAirbyte/Docker pour éviter les problèmes de Docker-in-Docker sur macOS.

Connecteurs supportés:
- PostgreSQL (psycopg2)
- MySQL (pymysql)
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)

# =============================================================================
# POSTGRESQL CONNECTOR
# =============================================================================

# JSON Schema pour la configuration PostgreSQL (compatible Airbyte)
POSTGRES_SPEC = {
    "type": "object",
    "title": "PostgreSQL Connection",
    "required": ["host", "port", "database", "username", "password"],
    "properties": {
        "host": {
            "type": "string",
            "title": "Host",
            "description": "Hostname or IP address of the PostgreSQL server",
            "order": 0,
        },
        "port": {
            "type": "integer",
            "title": "Port",
            "description": "Port number (default: 5432)",
            "default": 5432,
            "minimum": 1,
            "maximum": 65535,
            "order": 1,
        },
        "database": {
            "type": "string",
            "title": "Database",
            "description": "Name of the database to connect to",
            "order": 2,
        },
        "username": {
            "type": "string",
            "title": "Username",
            "description": "Database username",
            "order": 3,
        },
        "password": {
            "type": "string",
            "title": "Password",
            "description": "Database password",
            "airbyte_secret": True,
            "order": 4,
        },
        "ssl_mode": {
            "type": "string",
            "title": "SSL Mode",
            "description": "SSL connection mode",
            "default": "prefer",
            "enum": ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"],
            "order": 5,
            # NOTE: Ce spec utilise un format string simple pour l'UX du formulaire.
            # PyAirbyte source-postgres attend un objet {"mode": "disable"}.
            # La transformation est faite dans sync_service._transform_config_for_airbyte()
        },
        "schemas": {
            "type": "array",
            "title": "Schemas",
            "description": "Schemas to include (leave empty for all)",
            "items": {"type": "string"},
            "default": ["public"],
            "order": 6,
        },
    },
}

# JSON Schema pour MySQL
MYSQL_SPEC = {
    "type": "object",
    "title": "MySQL Connection",
    "required": ["host", "port", "database", "username", "password"],
    "properties": {
        "host": {
            "type": "string",
            "title": "Host",
            "description": "Hostname or IP address of the MySQL server",
            "order": 0,
        },
        "port": {
            "type": "integer",
            "title": "Port",
            "description": "Port number (default: 3306)",
            "default": 3306,
            "minimum": 1,
            "maximum": 65535,
            "order": 1,
        },
        "database": {
            "type": "string",
            "title": "Database",
            "description": "Name of the database to connect to",
            "order": 2,
        },
        "username": {
            "type": "string",
            "title": "Username",
            "description": "Database username",
            "order": 3,
        },
        "password": {
            "type": "string",
            "title": "Password",
            "description": "Database password",
            "airbyte_secret": True,
            "order": 4,
        },
        "ssl": {
            "type": "boolean",
            "title": "Use SSL",
            "description": "Enable SSL connection",
            "default": False,
            "order": 5,
        },
    },
}

# Liste des connecteurs natifs disponibles
NATIVE_CONNECTORS = {
    "postgres": {
        "id": "postgres",
        "name": "PostgreSQL",
        "spec": POSTGRES_SPEC,
        "category": "database",
    },
    "mysql": {
        "id": "mysql",
        "name": "MySQL",
        "spec": MYSQL_SPEC,
        "category": "database",
    },
}


def is_native_connector(connector_id: str) -> bool:
    """Vérifie si un connecteur a une implémentation native."""
    return connector_id in NATIVE_CONNECTORS


def get_native_spec(connector_id: str) -> dict[str, Any] | None:
    """Récupère le spec JSON Schema d'un connecteur natif."""
    if connector_id in NATIVE_CONNECTORS:
        return NATIVE_CONNECTORS[connector_id]["spec"]
    return None


def test_postgres_connection(config: dict[str, Any]) -> tuple[bool, str]:
    """
    Teste une connexion PostgreSQL.

    Returns:
        (success, message)
    """
    try:
        import psycopg2

        conn = psycopg2.connect(
            host=config["host"],
            port=config.get("port", 5432),
            database=config["database"],
            user=config["username"],
            password=config["password"],
            sslmode=config.get("ssl_mode", "prefer"),
            connect_timeout=10,
        )

        # Test simple query
        cursor = conn.cursor()
        cursor.execute("SELECT version()")
        version = cursor.fetchone()[0]
        cursor.close()
        conn.close()

        return True, f"Connected successfully. Server: {version[:50]}..."

    except ImportError:
        return False, "psycopg2 not installed"
    except Exception as e:
        logger.exception("PostgreSQL connection test failed")
        return False, str(e)


def test_mysql_connection(config: dict[str, Any]) -> tuple[bool, str]:
    """
    Teste une connexion MySQL.

    Returns:
        (success, message)
    """
    try:
        import pymysql

        conn = pymysql.connect(
            host=config["host"],
            port=config.get("port", 3306),
            database=config["database"],
            user=config["username"],
            password=config["password"],
            ssl={"ssl": {}} if config.get("ssl") else None,
            connect_timeout=10,
        )

        cursor = conn.cursor()
        cursor.execute("SELECT VERSION()")
        version = cursor.fetchone()[0]
        cursor.close()
        conn.close()

        return True, f"Connected successfully. Server: MySQL {version}"

    except ImportError:
        return False, "pymysql not installed"
    except Exception as e:
        logger.exception("MySQL connection test failed")
        return False, str(e)


def test_native_connection(connector_id: str, config: dict[str, Any]) -> tuple[bool, str]:
    """
    Teste une connexion avec un connecteur natif.

    Returns:
        (success, message)
    """
    if connector_id == "postgres":
        return test_postgres_connection(config)
    elif connector_id == "mysql":
        return test_mysql_connection(config)
    else:
        return False, f"No native connector for {connector_id}"


def discover_postgres_catalog(config: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Découvre le catalogue (tables/colonnes) d'une base PostgreSQL.

    Returns:
        Liste des streams/tables avec leurs colonnes, FK et row_count
    """
    try:
        import psycopg2

        conn = psycopg2.connect(
            host=config["host"],
            port=config.get("port", 5432),
            database=config["database"],
            user=config["username"],
            password=config["password"],
            sslmode=config.get("ssl_mode", "prefer"),
        )

        cursor = conn.cursor()

        # Schemas à inclure
        schemas = config.get("schemas", ["public"])
        if not schemas:
            schemas = ["public"]

        # Récupérer toutes les FK en une seule requête
        cursor.execute("""
            SELECT
                tc.table_schema,
                tc.table_name,
                kcu.column_name,
                ccu.table_schema AS foreign_schema,
                ccu.table_name AS foreign_table,
                ccu.column_name AS foreign_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
        """)

        # Index FK par table
        fk_by_table: dict[str, list[dict[str, str]]] = {}
        for row in cursor.fetchall():
            schema, table, col, fk_schema, fk_table, fk_col = row
            key = f"{schema}.{table}"
            if key not in fk_by_table:
                fk_by_table[key] = []
            # Format cible: schema.table ou juste table si public
            ref_table = fk_table if fk_schema == "public" else f"{fk_schema}.{fk_table}"
            fk_by_table[key].append({
                "column": col,
                "references_table": ref_table,
                "references_column": fk_col,
            })

        streams = []

        for schema in schemas:
            # Récupérer les tables avec estimation du nombre de lignes
            cursor.execute("""
                SELECT
                    t.table_name,
                    COALESCE(s.n_live_tup, 0) as row_count
                FROM information_schema.tables t
                LEFT JOIN pg_stat_user_tables s
                    ON s.schemaname = t.table_schema AND s.relname = t.table_name
                WHERE t.table_schema = %s
                AND t.table_type = 'BASE TABLE'
                ORDER BY t.table_name
            """, (schema,))

            tables = cursor.fetchall()

            for table_name, row_count in tables:
                # Récupérer les colonnes
                cursor.execute("""
                    SELECT
                        column_name,
                        data_type,
                        is_nullable,
                        column_default
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                """, (schema, table_name))

                columns = []
                for col_name, data_type, is_nullable, _ in cursor.fetchall():
                    columns.append({
                        "name": col_name,
                        "type": _pg_type_to_json_type(data_type),
                        "nullable": is_nullable == "YES",
                    })

                # Récupérer la primary key
                cursor.execute("""
                    SELECT a.attname
                    FROM pg_index i
                    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                    WHERE i.indrelid = %s::regclass AND i.indisprimary
                """, (f"{schema}.{table_name}",))

                primary_key = [row[0] for row in cursor.fetchall()]

                # Récupérer les FK pour cette table
                table_key = f"{schema}.{table_name}"
                foreign_keys = fk_by_table.get(table_key, [])

                stream_name = f"{schema}.{table_name}" if schema != "public" else table_name
                streams.append({
                    "schema": schema,
                    "name": stream_name,
                    "columns": columns,
                    "primary_key": primary_key,
                    "foreign_keys": foreign_keys,
                    "row_count": row_count,
                })

        cursor.close()
        conn.close()

        return streams

    except Exception as e:
        logger.exception("PostgreSQL catalog discovery failed")
        return []


def discover_mysql_catalog(config: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Découvre le catalogue (tables/colonnes) d'une base MySQL.

    Returns:
        Liste des streams/tables avec leurs colonnes, FK et row_count
    """
    try:
        import pymysql

        conn = pymysql.connect(
            host=config["host"],
            port=config.get("port", 3306),
            database=config["database"],
            user=config["username"],
            password=config["password"],
            ssl={"ssl": {}} if config.get("ssl") else None,
        )

        cursor = conn.cursor()
        database = config["database"]

        # Récupérer toutes les FK en une seule requête
        cursor.execute("""
            SELECT
                TABLE_NAME,
                COLUMN_NAME,
                REFERENCED_TABLE_NAME,
                REFERENCED_COLUMN_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = %s
            AND REFERENCED_TABLE_NAME IS NOT NULL
        """, (database,))

        # Index FK par table
        fk_by_table: dict[str, list[dict[str, str]]] = {}
        for row in cursor.fetchall():
            table, col, ref_table, ref_col = row
            if table not in fk_by_table:
                fk_by_table[table] = []
            fk_by_table[table].append({
                "column": col,
                "references_table": ref_table,
                "references_column": ref_col,
            })

        # Récupérer les tables avec estimation du nombre de lignes
        cursor.execute("""
            SELECT
                TABLE_NAME,
                TABLE_ROWS
            FROM information_schema.tables
            WHERE table_schema = %s
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        """, (database,))

        tables = cursor.fetchall()
        streams = []

        for table_name, row_count in tables:
            # Récupérer les colonnes
            cursor.execute("""
                SELECT
                    column_name,
                    data_type,
                    is_nullable,
                    column_key
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position
            """, (database, table_name))

            columns = []
            primary_key = []
            for col_name, data_type, is_nullable, col_key in cursor.fetchall():
                columns.append({
                    "name": col_name,
                    "type": _mysql_type_to_json_type(data_type),
                    "nullable": is_nullable == "YES",
                })
                if col_key == "PRI":
                    primary_key.append(col_name)

            # Récupérer les FK pour cette table
            foreign_keys = fk_by_table.get(table_name, [])

            streams.append({
                "schema": database,
                "name": table_name,
                "columns": columns,
                "primary_key": primary_key,
                "foreign_keys": foreign_keys,
                "row_count": row_count or 0,
            })

        cursor.close()
        conn.close()

        return streams

    except Exception as e:
        logger.exception("MySQL catalog discovery failed")
        return []


def discover_native_catalog(connector_id: str, config: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Découvre le catalogue avec un connecteur natif.
    """
    if connector_id == "postgres":
        return discover_postgres_catalog(config)
    elif connector_id == "mysql":
        return discover_mysql_catalog(config)
    else:
        return []


def _pg_type_to_json_type(pg_type: str) -> str:
    """Convertit un type PostgreSQL en type JSON Schema."""
    pg_type = pg_type.lower()

    if pg_type in ("integer", "smallint", "bigint", "serial", "bigserial"):
        return "integer"
    elif pg_type in ("real", "double precision", "numeric", "decimal", "money"):
        return "number"
    elif pg_type in ("boolean", "bool"):
        return "boolean"
    elif pg_type.startswith("timestamp") or pg_type == "date":
        return "string"  # ISO format
    elif pg_type in ("json", "jsonb"):
        return "object"
    elif pg_type.startswith("_") or pg_type == "array":
        return "array"
    else:
        return "string"


def _mysql_type_to_json_type(mysql_type: str) -> str:
    """Convertit un type MySQL en type JSON Schema."""
    mysql_type = mysql_type.lower()

    if mysql_type in ("int", "tinyint", "smallint", "mediumint", "bigint"):
        return "integer"
    elif mysql_type in ("float", "double", "decimal", "numeric"):
        return "number"
    elif mysql_type in ("boolean", "bool", "bit"):
        return "boolean"
    elif mysql_type in ("date", "datetime", "timestamp", "time", "year"):
        return "string"
    elif mysql_type == "json":
        return "object"
    else:
        return "string"
