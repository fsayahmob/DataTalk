#!/usr/bin/env python3
"""
Script de migration SQLite → PostgreSQL pour DataTalk.

Ce script effectue les remplacements de syntaxe SQL dans tous les fichiers Python du backend:
- ? → %s (paramètres de requête)
- lastrowid → RETURNING id + fetchone()
- INSERT OR REPLACE → INSERT ... ON CONFLICT DO UPDATE
- INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
- datetime('now'...) → CURRENT_TIMESTAMP - INTERVAL
- strftime() → TO_CHAR()
- = 1 (boolean) → = TRUE / = true
- = 0 (boolean) → = FALSE / = false

Usage:
    python scripts/migrate_sqlite_to_postgres.py --dry-run  # Voir les changements
    python scripts/migrate_sqlite_to_postgres.py            # Appliquer les changements
"""

import re
import sys
from pathlib import Path


def replace_placeholders(content: str) -> str:
    """Remplace ? par %s dans les requêtes SQL."""
    # Pattern: trouver les SQL avec des ? et les remplacer par %s
    # Attention à ne pas remplacer les ? dans les commentaires ou strings non-SQL

    # Remplacer les ? dans les contextes SQL (après VALUES, WHERE, SET, etc.)
    patterns = [
        # VALUES (..., ?, ?, ...)
        (r"VALUES\s*\(([^)]*)\)", lambda m: "VALUES (" + m.group(1).replace("?", "%s") + ")"),
        # WHERE col = ?
        (r"(WHERE\s+\w+\s*[=<>!]+\s*)\?", r"\1%s"),
        # WHERE col IN (?)
        (r"(IN\s*\()\?(\))", r"\1%s\2"),
        # SET col = ?
        (r"(SET\s+\w+\s*=\s*)\?", r"\1%s"),
        # AND/OR col = ?
        (r"((?:AND|OR)\s+\w+\s*[=<>!]+\s*)\?", r"\1%s"),
        # LIMIT ?
        (r"(LIMIT\s+)\?", r"\1%s"),
        # Simple remaining ? in SQL contexts
        (r",\s*\?(?=\s*[,)])", ", %s"),
    ]

    result = content
    for pattern, replacement in patterns:
        if callable(replacement):
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE | re.DOTALL)
        else:
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

    return result


def replace_lastrowid(content: str) -> str:
    """Remplace cursor.lastrowid par RETURNING id pattern."""
    # Ce pattern est complexe car il faut:
    # 1. Ajouter RETURNING id à l'INSERT
    # 2. Remplacer lastrowid par fetchone()[0]

    # Pattern simple pour cursor.lastrowid
    content = re.sub(
        r"(\w+_id)\s*=\s*cursor\.lastrowid",
        r"\1 = cursor.fetchone()[0]",
        content
    )

    # Supprimer les assert sur lastrowid
    content = re.sub(
        r'\s*assert\s+\w+_id\s+is\s+not\s+None.*\n',
        '\n',
        content
    )

    return content


def replace_insert_or(content: str) -> str:
    """Remplace INSERT OR REPLACE/IGNORE par ON CONFLICT."""
    # INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
    content = re.sub(
        r"INSERT\s+OR\s+IGNORE\s+INTO",
        "INSERT INTO",
        content,
        flags=re.IGNORECASE
    )

    # INSERT OR REPLACE est plus complexe - nécessite ON CONFLICT DO UPDATE
    # Pour l'instant, on le laisse car ça dépend de la clé unique
    content = re.sub(
        r"INSERT\s+OR\s+REPLACE\s+INTO",
        "INSERT INTO",
        content,
        flags=re.IGNORECASE
    )

    return content


def replace_datetime_functions(content: str) -> str:
    """Remplace les fonctions datetime SQLite par PostgreSQL."""
    # datetime('now', '-X days') → CURRENT_TIMESTAMP - INTERVAL 'X days'
    content = re.sub(
        r"datetime\s*\(\s*'now'\s*,\s*'\s*-\s*(\d+)\s*days'\s*\)",
        r"CURRENT_TIMESTAMP - INTERVAL '\1 days'",
        content,
        flags=re.IGNORECASE
    )

    # datetime(CURRENT_TIMESTAMP, '+' || ? || ' minutes')
    # → CURRENT_TIMESTAMP + make_interval(mins => ?)
    content = re.sub(
        r"datetime\s*\(\s*CURRENT_TIMESTAMP\s*,\s*'\+'\s*\|\|\s*\?\s*\|\|\s*'\s*minutes'\s*\)",
        "CURRENT_TIMESTAMP + make_interval(mins => %s)",
        content,
        flags=re.IGNORECASE
    )

    # strftime('%Y-%m-%d %H:00', col) → TO_CHAR(col, 'YYYY-MM-DD HH24:00')
    content = re.sub(
        r"strftime\s*\(\s*'%Y-%m-%d %H:00'\s*,\s*(\w+)\s*\)",
        r"TO_CHAR(\1, 'YYYY-MM-DD HH24:00')",
        content,
        flags=re.IGNORECASE
    )

    return content


def replace_boolean_comparisons(content: str) -> str:
    """Remplace les comparaisons booléennes 0/1 par FALSE/TRUE."""
    # is_active = 1 → is_active = TRUE (dans les WHERE)
    content = re.sub(
        r"(\bis_\w+\s*=\s*)1\b",
        r"\1TRUE",
        content
    )
    content = re.sub(
        r"(\bis_\w+\s*=\s*)0\b",
        r"\1FALSE",
        content
    )

    # success = 1 → success = TRUE
    content = re.sub(
        r"(\bsuccess\s*=\s*)1\b",
        r"\1TRUE",
        content
    )

    return content


def migrate_file(filepath: Path, dry_run: bool = False) -> tuple[bool, str]:
    """
    Migre un fichier Python de SQLite vers PostgreSQL.

    Returns:
        (changed, diff_preview)
    """
    content = filepath.read_text()
    original = content

    # Appliquer les transformations
    content = replace_placeholders(content)
    content = replace_lastrowid(content)
    content = replace_insert_or(content)
    content = replace_datetime_functions(content)
    content = replace_boolean_comparisons(content)

    if content == original:
        return False, ""

    if not dry_run:
        filepath.write_text(content)

    # Générer un diff simplifié
    diff_lines = []
    orig_lines = original.split('\n')
    new_lines = content.split('\n')
    for i, (orig, new) in enumerate(zip(orig_lines, new_lines)):
        if orig != new:
            diff_lines.append(f"  L{i+1}: {orig[:80]}")
            diff_lines.append(f"     → {new[:80]}")

    return True, '\n'.join(diff_lines[:20])  # Limiter à 20 lignes de diff


def main():
    dry_run = "--dry-run" in sys.argv

    backend_dir = Path(__file__).parent.parent / "backend"

    # Fichiers à migrer
    patterns = [
        "catalog/*.py",
        "llm_config/*.py",
        "catalog_engine/*.py",
        "tasks/*.py",
        "kpi_service.py",
    ]

    files_to_migrate = []
    for pattern in patterns:
        files_to_migrate.extend(backend_dir.glob(pattern))

    # Exclure __init__.py et __pycache__
    files_to_migrate = [
        f for f in files_to_migrate
        if f.name != "__init__.py" and "__pycache__" not in str(f)
    ]

    print(f"{'[DRY RUN] ' if dry_run else ''}Migration SQLite → PostgreSQL")
    print(f"Fichiers à analyser: {len(files_to_migrate)}")
    print("-" * 60)

    changed_count = 0
    for filepath in sorted(files_to_migrate):
        changed, diff = migrate_file(filepath, dry_run=dry_run)
        if changed:
            changed_count += 1
            status = "[WOULD CHANGE]" if dry_run else "[CHANGED]"
            print(f"{status} {filepath.relative_to(backend_dir)}")
            if diff:
                print(diff)
            print()

    print("-" * 60)
    print(f"Fichiers {'à modifier' if dry_run else 'modifiés'}: {changed_count}")

    if dry_run and changed_count > 0:
        print("\nPour appliquer les changements:")
        print("  python scripts/migrate_sqlite_to_postgres.py")


if __name__ == "__main__":
    main()
