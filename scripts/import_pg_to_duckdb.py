#!/usr/bin/env python3
"""
Script d'import PostgreSQL dump vers DuckDB

Usage:
    python import_pg_to_duckdb.py <dump.sql> [output.duckdb]

Exemple:
    python import_pg_to_duckdb.py ../data/dump-thanosdb-202601121436.sql ../data/thanosdb.duckdb
"""

import os
import re
import sys
from pathlib import Path

import duckdb


def parse_pg_create_table(sql: str) -> dict[str, list[tuple[str, str]]]:
    """
    Parse les CREATE TABLE PostgreSQL et retourne un dict {table_name: [(col_name, col_type), ...]}
    """
    tables = {}

    # Pattern pour CREATE TABLE
    create_pattern = r'CREATE TABLE (?:public\.)?(\w+)\s*\((.*?)\);'

    for match in re.finditer(create_pattern, sql, re.DOTALL | re.IGNORECASE):
        table_name = match.group(1)
        columns_block = match.group(2)

        columns = []
        # Séparer les colonnes (attention aux virgules dans les DEFAULT)
        col_lines = []
        paren_depth = 0
        current_line = ""

        for char in columns_block:
            if char == '(':
                paren_depth += 1
                current_line += char
            elif char == ')':
                paren_depth -= 1
                current_line += char
            elif char == ',' and paren_depth == 0:
                col_lines.append(current_line.strip())
                current_line = ""
            else:
                current_line += char

        if current_line.strip():
            col_lines.append(current_line.strip())

        for col_line in col_lines:
            # Ignorer les contraintes (PRIMARY KEY, FOREIGN KEY, etc.)
            if any(kw in col_line.upper() for kw in ['PRIMARY KEY', 'FOREIGN KEY', 'CONSTRAINT', 'UNIQUE', 'CHECK']):
                continue

            # Parser nom et type de colonne
            col_match = re.match(r'(\w+)\s+(.+?)(?:\s+(?:NOT NULL|NULL|DEFAULT|GENERATED).*)?$', col_line, re.IGNORECASE)
            if col_match:
                col_name = col_match.group(1)
                pg_type = col_match.group(2).strip()
                duckdb_type = convert_pg_type_to_duckdb(pg_type)
                columns.append((col_name, duckdb_type))

        if columns:
            tables[table_name] = columns

    return tables


def convert_pg_type_to_duckdb(pg_type: str) -> str:
    """
    Convertit un type PostgreSQL en type DuckDB.
    """
    pg_type_lower = pg_type.lower().strip()

    # Types numériques
    if pg_type_lower in ('bigint', 'int8'):
        return 'BIGINT'
    if pg_type_lower in ('integer', 'int', 'int4'):
        return 'INTEGER'
    if pg_type_lower in ('smallint', 'int2'):
        return 'SMALLINT'
    if pg_type_lower in ('real', 'float4'):
        return 'REAL'
    if pg_type_lower in ('double precision', 'float8'):
        return 'DOUBLE'
    if pg_type_lower.startswith('numeric') or pg_type_lower.startswith('decimal'):
        return 'DECIMAL'

    # Types texte
    if pg_type_lower.startswith('character varying') or pg_type_lower.startswith('varchar'):
        return 'VARCHAR'
    if pg_type_lower.startswith('character(') or pg_type_lower.startswith('char('):
        return 'VARCHAR'
    if pg_type_lower in ('text', 'name'):
        return 'VARCHAR'

    # Types date/temps
    if 'timestamp' in pg_type_lower:
        return 'TIMESTAMP'
    if pg_type_lower == 'date':
        return 'DATE'
    if pg_type_lower.startswith('time ') or pg_type_lower == 'time':
        return 'TIME'
    if pg_type_lower.startswith('interval'):
        return 'INTERVAL'

    # Types booléens
    if pg_type_lower == 'boolean':
        return 'BOOLEAN'

    # Types binaires
    if pg_type_lower == 'bytea':
        return 'BLOB'

    # UUID
    if pg_type_lower == 'uuid':
        return 'UUID'

    # JSON
    if pg_type_lower in ('json', 'jsonb'):
        return 'JSON'

    # Défaut
    print(f"  [WARN] Type PostgreSQL inconnu: {pg_type} -> VARCHAR")
    return 'VARCHAR'


def parse_pg_insert(line: str) -> tuple[str, list[str]] | None:
    """
    Parse une ligne INSERT INTO et retourne (table_name, values_list).
    """
    # Pattern: INSERT INTO public.table VALUES (...)
    match = re.match(r"INSERT INTO (?:public\.)?(\w+)\s+VALUES\s*\((.+)\);?\s*$", line, re.IGNORECASE)
    if not match:
        return None

    table_name = match.group(1)
    values_str = match.group(2)

    return table_name, values_str


def escape_value_for_duckdb(value: str) -> str:
    """
    Échappe une valeur pour DuckDB.
    """
    value = value.strip()

    # NULL
    if value.upper() == 'NULL':
        return 'NULL'

    # Booléens
    if value.lower() in ('true', 'false'):
        return value.lower()

    # Bytea (données binaires PostgreSQL) -> convertir en NULL ou BLOB
    if value.startswith("'\\x"):
        # Pour simplifier, on ignore les données binaires (icons, etc.)
        return 'NULL'

    # Chaînes avec quotes
    if value.startswith("'") and value.endswith("'"):
        # Remplacer les échappements PostgreSQL
        inner = value[1:-1]
        # Doubler les quotes simples pour DuckDB
        inner = inner.replace("''", "'")
        inner = inner.replace("'", "''")
        return f"'{inner}'"

    # Nombres
    return value


def import_pg_dump_to_duckdb(dump_path: str, duckdb_path: str):
    """
    Importe un dump PostgreSQL dans DuckDB.
    """
    print(f"Lecture du dump: {dump_path}")

    with open(dump_path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    # 1. Parser les CREATE TABLE
    print("1/3 - Parsing des CREATE TABLE...")
    tables = parse_pg_create_table(content)
    print(f"    {len(tables)} tables trouvées: {', '.join(tables.keys())}")

    # 2. Créer les tables dans DuckDB
    print(f"2/3 - Création des tables dans {duckdb_path}...")

    # Supprimer le fichier existant si présent
    if os.path.exists(duckdb_path):
        os.remove(duckdb_path)
        print(f"    Fichier existant supprimé")

    conn = duckdb.connect(duckdb_path)

    for table_name, columns in tables.items():
        cols_def = ", ".join([f'"{col_name}" {col_type}' for col_name, col_type in columns])
        create_sql = f'CREATE TABLE "{table_name}" ({cols_def})'
        try:
            conn.execute(create_sql)
            print(f"    [OK] Table {table_name} créée ({len(columns)} colonnes)")
        except Exception as e:
            print(f"    [ERR] Table {table_name}: {e}")

    # 3. Insérer les données
    print("3/3 - Insertion des données...")

    stats = {table: 0 for table in tables}
    errors = {table: 0 for table in tables}

    # Lire ligne par ligne pour économiser la mémoire
    with open(dump_path, 'r', encoding='utf-8', errors='replace') as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line.startswith('INSERT INTO'):
                continue

            parsed = parse_pg_insert(line)
            if not parsed:
                continue

            table_name, values_str = parsed

            if table_name not in tables:
                continue

            # Construire l'INSERT DuckDB
            columns = tables[table_name]
            col_names = ", ".join([f'"{col[0]}"' for col in columns])

            try:
                # Parser les valeurs (gestion des virgules dans les strings)
                values = []
                current_val = ""
                in_string = False
                escape_next = False
                paren_depth = 0

                for char in values_str:
                    if escape_next:
                        current_val += char
                        escape_next = False
                        continue

                    if char == '\\':
                        current_val += char
                        escape_next = True
                        continue

                    if char == "'" and not escape_next:
                        in_string = not in_string
                        current_val += char
                        continue

                    if not in_string:
                        if char == '(':
                            paren_depth += 1
                            current_val += char
                        elif char == ')':
                            paren_depth -= 1
                            current_val += char
                        elif char == ',' and paren_depth == 0:
                            values.append(escape_value_for_duckdb(current_val))
                            current_val = ""
                        else:
                            current_val += char
                    else:
                        current_val += char

                if current_val:
                    values.append(escape_value_for_duckdb(current_val))

                # Vérifier le nombre de colonnes
                if len(values) != len(columns):
                    # Essayer d'ajuster
                    if len(values) < len(columns):
                        values.extend(['NULL'] * (len(columns) - len(values)))
                    else:
                        values = values[:len(columns)]

                values_sql = ", ".join(values)
                insert_sql = f'INSERT INTO "{table_name}" ({col_names}) VALUES ({values_sql})'

                conn.execute(insert_sql)
                stats[table_name] += 1

            except Exception as e:
                errors[table_name] += 1
                if errors[table_name] <= 3:
                    print(f"    [ERR] {table_name} ligne {line_no}: {str(e)[:100]}")

    conn.close()

    # Résumé
    print("\n" + "=" * 50)
    print("RÉSUMÉ DE L'IMPORT")
    print("=" * 50)
    total_rows = 0
    total_errors = 0
    for table in tables:
        rows = stats[table]
        errs = errors[table]
        total_rows += rows
        total_errors += errs
        status = "[OK]" if errs == 0 else f"[WARN: {errs} erreurs]"
        print(f"  {table}: {rows} lignes {status}")

    print("-" * 50)
    print(f"TOTAL: {total_rows} lignes insérées, {total_errors} erreurs")
    print(f"Base DuckDB: {duckdb_path}")

    return total_rows, total_errors


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    dump_path = sys.argv[1]

    if not os.path.exists(dump_path):
        print(f"Erreur: fichier non trouvé: {dump_path}")
        sys.exit(1)

    # Chemin de sortie par défaut
    if len(sys.argv) >= 3:
        duckdb_path = sys.argv[2]
    else:
        # Même dossier, extension .duckdb
        dump_name = Path(dump_path).stem
        duckdb_path = str(Path(dump_path).parent / f"{dump_name}.duckdb")

    import_pg_dump_to_duckdb(dump_path, duckdb_path)


if __name__ == "__main__":
    main()
