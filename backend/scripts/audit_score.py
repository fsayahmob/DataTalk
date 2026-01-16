#!/usr/bin/env python3
"""
Script d'audit qualité code - Score sur 100.

Vérifie:
- Linting (ruff)
- Formatting (ruff format)
- Types (mypy)
- Tests
- Couverture
- Fichiers trop gros
- Secrets en dur
- Code dupliqué
- Dépendances redondantes
- Réinvention de la roue (code maison vs lib existante)

Usage:
    python scripts/audit_score.py [--json] [--fail-under=70]

Output:
    - Score sur 100 avec détails
    - Code retour 0 si score >= fail-under, 1 sinon
    - Option --json pour intégration CI
"""

import argparse
import ast
import json
import re
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class AuditResult:
    """Résultat d'une vérification."""

    name: str
    score_impact: int  # Négatif = pénalité
    details: str
    passed: bool
    category: str = "quality"  # quality, security, architecture, maintenance


@dataclass
class AuditReport:
    """Rapport d'audit complet."""

    score: int = 100
    grade: str = "A"
    results: list[AuditResult] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def add_result(self, result: AuditResult) -> None:
        self.results.append(result)
        if not result.passed:
            self.score = max(0, self.score + result.score_impact)

    def add_warning(self, warning: str) -> None:
        self.warnings.append(warning)

    def compute_grade(self) -> None:
        if self.score >= 90:
            self.grade = "A"
        elif self.score >= 80:
            self.grade = "B"
        elif self.score >= 70:
            self.grade = "C"
        elif self.score >= 60:
            self.grade = "D"
        else:
            self.grade = "F"

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "grade": self.grade,
            "results": [
                {
                    "name": r.name,
                    "category": r.category,
                    "passed": r.passed,
                    "impact": r.score_impact,
                    "details": r.details,
                }
                for r in self.results
            ],
            "warnings": self.warnings,
        }


def run_command(cmd: list[str], cwd: Path | None = None) -> tuple[int, str, str]:
    """Exécute une commande et retourne (code, stdout, stderr)."""
    try:
        result = subprocess.run(
            cmd,
            check=False, capture_output=True,
            text=True,
            cwd=cwd,
            timeout=120,
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Timeout"
    except FileNotFoundError:
        return -1, "", f"Command not found: {cmd[0]}"


# =============================================================================
# CHECKS QUALITÉ DE BASE
# =============================================================================


def check_ruff_lint(project_path: Path) -> AuditResult:
    """Vérifie le linting avec ruff."""
    code, stdout, stderr = run_command(
        ["ruff", "check", ".", "--exclude", "scripts,tests"], cwd=project_path
    )

    if code == 0:
        return AuditResult(
            name="Ruff Lint",
            score_impact=0,
            details="0 erreurs",
            passed=True,
            category="quality",
        )

    error_count = len(stdout.strip().split("\n")) if stdout.strip() else 0
    penalty = min(15, error_count * 2)

    return AuditResult(
        name="Ruff Lint",
        score_impact=-penalty,
        details=f"{error_count} erreurs",
        passed=False,
        category="quality",
    )


def check_ruff_format(project_path: Path) -> AuditResult:
    """Vérifie le formatting avec ruff."""
    code, stdout, _ = run_command(
        ["ruff", "format", "--check", ".", "--exclude", "scripts,tests"], cwd=project_path
    )

    if code == 0:
        return AuditResult(
            name="Ruff Format",
            score_impact=0,
            details="Formatage OK",
            passed=True,
            category="quality",
        )

    return AuditResult(
        name="Ruff Format",
        score_impact=-5,
        details="Fichiers mal formatés",
        passed=False,
        category="quality",
    )


def check_mypy(project_path: Path) -> AuditResult:
    """Vérifie les types avec mypy."""
    code, stdout, stderr = run_command(
        ["mypy", ".", "--ignore-missing-imports", "--exclude", "scripts|tests"],
        cwd=project_path,
    )

    output = stdout + stderr
    error_lines = [l for l in output.split("\n") if "error:" in l]
    error_count = len(error_lines)

    if error_count == 0:
        return AuditResult(
            name="Mypy Types",
            score_impact=0,
            details="0 erreurs de type",
            passed=True,
            category="quality",
        )

    penalty = min(15, error_count * 3)

    return AuditResult(
        name="Mypy Types",
        score_impact=-penalty,
        details=f"{error_count} erreurs de type",
        passed=False,
        category="quality",
    )


def check_tests(project_path: Path) -> AuditResult:
    """Vérifie que les tests passent."""
    code, stdout, stderr = run_command(
        ["python", "-m", "pytest", "--tb=no", "-q"], cwd=project_path
    )

    output = stdout + stderr

    if "passed" in output and "failed" not in output and "error" not in output.lower():
        match = re.search(r"(\d+) passed", output)
        test_count = match.group(1) if match else "?"
        return AuditResult(
            name="Tests",
            score_impact=0,
            details=f"{test_count} tests passent",
            passed=True,
            category="quality",
        )

    return AuditResult(
        name="Tests",
        score_impact=-20,
        details="Tests en échec",
        passed=False,
        category="quality",
    )


def check_coverage(project_path: Path) -> AuditResult:
    """Vérifie la couverture de code."""
    code, stdout, stderr = run_command(
        ["python", "-m", "pytest", "--cov=.", "--cov-report=term", "--tb=no", "-q"],
        cwd=project_path,
    )

    output = stdout + stderr
    match = re.search(r"TOTAL\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)%", output)

    if not match:
        return AuditResult(
            name="Couverture",
            score_impact=-10,
            details="Impossible de calculer",
            passed=False,
            category="quality",
        )

    coverage = int(match.group(1))

    if coverage >= 70:
        return AuditResult(
            name="Couverture",
            score_impact=0,
            details=f"{coverage}% (cible: 70%)",
            passed=True,
            category="quality",
        )
    if coverage >= 50:
        return AuditResult(
            name="Couverture",
            score_impact=-10,
            details=f"{coverage}% (cible: 70%)",
            passed=False,
            category="quality",
        )
    return AuditResult(
        name="Couverture",
        score_impact=-20,
        details=f"{coverage}% (cible: 70%)",
        passed=False,
        category="quality",
    )


# =============================================================================
# CHECKS ARCHITECTURE
# =============================================================================


def check_large_files(project_path: Path) -> AuditResult:
    """Vérifie qu'il n'y a pas de fichiers trop gros (>500 lignes)."""
    large_files = []
    skip_dirs = {"venv", ".venv", "__pycache__", "tests", ".git", "scripts", "node_modules"}

    for py_file in project_path.rglob("*.py"):
        if any(part in py_file.parts for part in skip_dirs):
            continue

        try:
            line_count = len(py_file.read_text().split("\n"))
            if line_count > 500:
                large_files.append((py_file.name, line_count))
        except Exception:
            pass

    if not large_files:
        return AuditResult(
            name="Taille fichiers",
            score_impact=0,
            details="Tous < 500 lignes",
            passed=True,
            category="architecture",
        )

    penalty = min(15, len(large_files) * 5)
    files_str = ", ".join(f"{f[0]}({f[1]})" for f in large_files[:3])

    return AuditResult(
        name="Taille fichiers",
        score_impact=-penalty,
        details=f"{len(large_files)} fichiers >500 lignes: {files_str}",
        passed=False,
        category="architecture",
    )


def check_duplicate_code(project_path: Path, report: AuditReport) -> AuditResult:
    """Détecte le code dupliqué (fonctions similaires)."""
    skip_dirs = {"venv", ".venv", "__pycache__", "tests", ".git", "scripts"}
    function_signatures: dict[str, list[str]] = {}

    for py_file in project_path.rglob("*.py"):
        if any(part in py_file.parts for part in skip_dirs):
            continue

        try:
            content = py_file.read_text()
            tree = ast.parse(content)

            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    # Créer une signature simplifiée (nom + nb args)
                    sig = f"{node.name}({len(node.args.args)}args)"
                    if sig not in function_signatures:
                        function_signatures[sig] = []
                    function_signatures[sig].append(f"{py_file.name}:{node.lineno}")

        except Exception:
            pass

    # Trouver les fonctions avec le même nom défini plusieurs fois
    duplicates = {k: v for k, v in function_signatures.items() if len(v) > 1}

    # Filtrer les faux positifs (test_, __init__, etc.)
    real_duplicates = {
        k: v
        for k, v in duplicates.items()
        if not k.startswith("test_")
        and not k.startswith("__")
        and not k.startswith("_")
    }

    if not real_duplicates:
        return AuditResult(
            name="Code dupliqué",
            score_impact=0,
            details="Pas de duplication détectée",
            passed=True,
            category="architecture",
        )

    # Ajouter des warnings détaillés
    for sig, locations in list(real_duplicates.items())[:3]:
        report.add_warning(f"Fonction '{sig}' définie dans: {', '.join(locations)}")

    penalty = min(10, len(real_duplicates) * 3)

    return AuditResult(
        name="Code dupliqué",
        score_impact=-penalty,
        details=f"{len(real_duplicates)} fonctions potentiellement dupliquées",
        passed=False,
        category="architecture",
    )


def check_redundant_dependencies(project_path: Path, report: AuditReport) -> AuditResult:
    """Détecte les dépendances redondantes (libs qui font la même chose)."""

    # Groupes de libs qui font la même chose
    REDUNDANT_GROUPS = {
        "http_client": ["requests", "httpx", "aiohttp", "urllib3"],
        "json_schema": ["pydantic", "marshmallow", "attrs", "dataclasses-json"],
        "testing": ["pytest", "unittest", "nose"],
        "async_http": ["aiohttp", "httpx"],
        "cli": ["click", "typer", "argparse", "fire"],
        "env": ["python-dotenv", "environs", "python-decouple"],
        "retry": ["tenacity", "retry", "backoff"],
        "logging": ["loguru", "structlog", "logging"],
        "datetime": ["pendulum", "arrow", "dateutil"],
        "validation": ["cerberus", "voluptuous", "schema"],
    }

    # Lire requirements.txt ou pyproject.toml
    requirements: set[str] = set()

    req_file = project_path / "requirements.txt"
    if req_file.exists():
        for line in req_file.read_text().split("\n"):
            line = line.strip().lower()
            if line and not line.startswith("#"):
                # Extraire le nom du package (avant ==, >=, etc.)
                pkg = re.split(r"[=<>!\[]", line)[0].strip()
                if pkg:
                    requirements.add(pkg)

    # Vérifier aussi les imports dans le code
    skip_dirs = {"venv", ".venv", "__pycache__", ".git"}
    imports: set[str] = set()

    for py_file in project_path.rglob("*.py"):
        if any(part in py_file.parts for part in skip_dirs):
            continue
        try:
            content = py_file.read_text()
            # Trouver les imports
            for match in re.finditer(r"^(?:from|import)\s+(\w+)", content, re.MULTILINE):
                imports.add(match.group(1).lower())
        except Exception:
            pass

    all_deps = requirements | imports

    # Détecter les redondances
    redundant_found = []
    for group_name, libs in REDUNDANT_GROUPS.items():
        found_in_group = [lib for lib in libs if lib in all_deps]
        if len(found_in_group) > 1:
            redundant_found.append((group_name, found_in_group))
            report.add_warning(
                f"Libs redondantes ({group_name}): {', '.join(found_in_group)} - Choisir une seule"
            )

    if not redundant_found:
        return AuditResult(
            name="Dépendances redondantes",
            score_impact=0,
            details="Pas de redondance détectée",
            passed=True,
            category="architecture",
        )

    penalty = min(10, len(redundant_found) * 5)

    return AuditResult(
        name="Dépendances redondantes",
        score_impact=-penalty,
        details=f"{len(redundant_found)} groupes de libs redondantes",
        passed=False,
        category="architecture",
    )


def check_reinventing_wheel(project_path: Path, report: AuditReport) -> AuditResult:
    """Détecte le code maison qui réinvente des libs existantes."""

    # Patterns de code maison qui devraient utiliser une lib
    WHEEL_PATTERNS = [
        {
            "pattern": r"def\s+retry\s*\([^)]*\).*?for\s+.*?in\s+range",
            "lib": "tenacity",
            "desc": "Retry manuel détecté, utiliser tenacity",
        },
        {
            "pattern": r"os\.environ\.get\([^)]+\).*os\.environ\.get\([^)]+\)",
            "lib": "pydantic-settings",
            "desc": "Config env manuelle, utiliser pydantic-settings",
        },
        {
            "pattern": r"json\.loads.*?try.*?except.*?json",
            "lib": "pydantic",
            "desc": "Parsing JSON manuel avec try/except, utiliser pydantic",
        },
        {
            "pattern": r"class\s+\w+Error\(Exception\).*?class\s+\w+Error\(Exception\)",
            "lib": "custom exceptions OK",
            "desc": None,  # Pas un problème
        },
        {
            "pattern": r"datetime\.now\(\)\.strftime.*?datetime\.strptime",
            "lib": "pendulum ou arrow",
            "desc": "Manipulation datetime manuelle, considérer pendulum",
        },
        {
            "pattern": r"\.get\([^)]+,\s*{}\)\.get\([^)]+\)",
            "lib": "glom ou pydash",
            "desc": "Nested dict access manuel, considérer glom",
        },
        {
            "pattern": r"hashlib\.\w+\(.*?\.hexdigest\(\)",
            "lib": "OK si intentionnel",
            "desc": None,  # Crypto manuel peut être OK
        },
        {
            "pattern": r"base64\.b64encode.*?base64\.b64decode",
            "lib": "OK si intentionnel",
            "desc": None,
        },
        {
            "pattern": r"threading\.Lock\(\).*?with\s+.*?lock",
            "lib": "OK",
            "desc": None,  # Threading basique est OK
        },
        {
            "pattern": r"def\s+validate_\w+\s*\(.*?if\s+not.*?raise\s+ValueError",
            "lib": "pydantic validators",
            "desc": "Validation manuelle, utiliser pydantic validators",
        },
    ]

    skip_dirs = {"venv", ".venv", "__pycache__", ".git", "tests"}
    issues_found = []

    for py_file in project_path.rglob("*.py"):
        if any(part in py_file.parts for part in skip_dirs):
            continue

        try:
            content = py_file.read_text()

            for pattern_info in WHEEL_PATTERNS:
                if pattern_info["desc"] is None:
                    continue  # Skip non-issues

                if re.search(pattern_info["pattern"], content, re.DOTALL | re.MULTILINE):
                    issues_found.append({
                        "file": py_file.name,
                        "lib": pattern_info["lib"],
                        "desc": pattern_info["desc"],
                    })

        except Exception:
            pass

    # Dédupliquer par description
    unique_issues = {i["desc"]: i for i in issues_found}.values()

    if not unique_issues:
        return AuditResult(
            name="Réinvention roue",
            score_impact=0,
            details="Pas de code maison inutile détecté",
            passed=True,
            category="maintenance",
        )

    for issue in list(unique_issues)[:3]:
        report.add_warning(f"{issue['file']}: {issue['desc']}")

    # Pas de pénalité, juste warning (parfois c'est intentionnel)
    return AuditResult(
        name="Réinvention roue",
        score_impact=0,  # Warning seulement
        details=f"{len(list(unique_issues))} patterns détectés (voir warnings)",
        passed=True,
        category="maintenance",
    )


# =============================================================================
# CHECKS SÉCURITÉ
# =============================================================================


def check_secrets(project_path: Path) -> AuditResult:
    """Vérifie qu'il n'y a pas de secrets en dur."""
    secret_patterns = [
        (r'api_key\s*=\s*["\'][a-zA-Z0-9_-]{20,}["\']', "API key"),
        (r'password\s*=\s*["\'][^"\']{8,}["\']', "Password"),
        (r"sk-[a-zA-Z0-9]{20,}", "OpenAI key"),
        (r"ghp_[a-zA-Z0-9]{36}", "GitHub token"),
        (r"AKIA[A-Z0-9]{16}", "AWS key"),
        (r"xox[baprs]-[a-zA-Z0-9-]+", "Slack token"),
    ]

    skip_dirs = {"venv", ".venv", "__pycache__", ".git", "tests"}
    secrets_found = []

    for py_file in project_path.rglob("*.py"):
        if any(part in py_file.parts for part in skip_dirs):
            continue

        try:
            content = py_file.read_text()

            # Ignorer les fichiers de config exemple
            if "example" in py_file.name.lower() or "sample" in py_file.name.lower():
                continue

            for pattern, secret_type in secret_patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    secrets_found.append((py_file.name, secret_type))
                    break

        except Exception:
            pass

    if not secrets_found:
        return AuditResult(
            name="Secrets",
            score_impact=0,
            details="Aucun secret détecté",
            passed=True,
            category="security",
        )

    return AuditResult(
        name="Secrets",
        score_impact=-15,
        details=f"Secrets potentiels: {', '.join(f'{f[0]}({f[1]})' for f in secrets_found[:3])}",
        passed=False,
        category="security",
    )


def check_sql_injection(project_path: Path, report: AuditReport) -> AuditResult:
    """Détecte les risques d'injection SQL."""
    skip_dirs = {"venv", ".venv", "__pycache__", ".git", "tests"}

    # Patterns dangereux
    dangerous_patterns = [
        (r'execute\s*\(\s*f["\']', "f-string dans execute()"),
        (r"execute\s*\([^)]*\+", "Concaténation dans execute()"),
        (r"execute\s*\([^)]*%\s*\(", "% formatting dans execute()"),
        (r"execute\s*\([^)]*\.format\(", ".format() dans execute()"),
    ]

    issues = []

    for py_file in project_path.rglob("*.py"):
        if any(part in py_file.parts for part in skip_dirs):
            continue

        try:
            content = py_file.read_text()

            for pattern, desc in dangerous_patterns:
                matches = re.finditer(pattern, content)
                for match in matches:
                    # Trouver le numéro de ligne
                    line_num = content[:match.start()].count("\n") + 1
                    issues.append(f"{py_file.name}:{line_num} - {desc}")

        except Exception:
            pass

    if not issues:
        return AuditResult(
            name="Injection SQL",
            score_impact=0,
            details="Pas de risque détecté",
            passed=True,
            category="security",
        )

    for issue in issues[:3]:
        report.add_warning(f"SQL Injection potentielle: {issue}")

    return AuditResult(
        name="Injection SQL",
        score_impact=-10,
        details=f"{len(issues)} risques potentiels",
        passed=False,
        category="security",
    )


# =============================================================================
# CHECKS MAINTENANCE
# =============================================================================


def check_todos(project_path: Path) -> AuditResult:
    """Compte les TODO/FIXME (informatif)."""
    skip_dirs = {"venv", ".venv", "__pycache__", ".git"}
    todo_count = 0
    fixme_count = 0

    for py_file in project_path.rglob("*.py"):
        if any(part in py_file.parts for part in skip_dirs):
            continue

        try:
            content = py_file.read_text().upper()
            todo_count += content.count("TODO")
            fixme_count += content.count("FIXME")
        except Exception:
            pass

    total = todo_count + fixme_count

    return AuditResult(
        name="TODO/FIXME",
        score_impact=0,  # Informatif
        details=f"{todo_count} TODO, {fixme_count} FIXME",
        passed=True,
        category="maintenance",
    )


def check_import_consistency(project_path: Path, report: AuditReport) -> AuditResult:
    """Vérifie la cohérence des imports (même lib importée différemment)."""
    skip_dirs = {"venv", ".venv", "__pycache__", ".git", "tests"}

    import_styles: dict[str, set[str]] = {}  # module -> set of import styles

    for py_file in project_path.rglob("*.py"):
        if any(part in py_file.parts for part in skip_dirs):
            continue

        try:
            content = py_file.read_text()

            # Trouver tous les imports
            for line in content.split("\n"):
                line = line.strip()

                # import X
                match = re.match(r"^import\s+(\w+)", line)
                if match:
                    mod = match.group(1)
                    if mod not in import_styles:
                        import_styles[mod] = set()
                    import_styles[mod].add(f"import {mod}")

                # from X import Y
                match = re.match(r"^from\s+(\w+).*?import\s+(.+)", line)
                if match:
                    mod = match.group(1)
                    imports = match.group(2)
                    if mod not in import_styles:
                        import_styles[mod] = set()
                    import_styles[mod].add(f"from {mod} import ...")

        except Exception:
            pass

    # Trouver les modules importés de plusieurs façons
    inconsistent = {
        mod: styles
        for mod, styles in import_styles.items()
        if len(styles) > 1 and mod not in {"typing", "collections", "os", "sys"}
    }

    if not inconsistent:
        return AuditResult(
            name="Cohérence imports",
            score_impact=0,
            details="Imports cohérents",
            passed=True,
            category="maintenance",
        )

    for mod, styles in list(inconsistent.items())[:2]:
        report.add_warning(f"Import incohérent '{mod}': {', '.join(styles)}")

    return AuditResult(
        name="Cohérence imports",
        score_impact=-5,
        details=f"{len(inconsistent)} modules importés de façons différentes",
        passed=False,
        category="maintenance",
    )


# =============================================================================
# MAIN
# =============================================================================


def run_audit(project_path: Path) -> AuditReport:
    """Exécute l'audit complet."""
    report = AuditReport()

    # Checks de base
    basic_checks = [
        check_ruff_lint,
        check_ruff_format,
        check_mypy,
        check_tests,
        check_coverage,
    ]

    # Checks architecture (passent report pour warnings)
    def run_arch_checks():
        report.add_result(check_large_files(project_path))
        report.add_result(check_duplicate_code(project_path, report))
        report.add_result(check_redundant_dependencies(project_path, report))
        report.add_result(check_reinventing_wheel(project_path, report))

    # Checks sécurité
    def run_security_checks():
        report.add_result(check_secrets(project_path))
        report.add_result(check_sql_injection(project_path, report))

    # Checks maintenance
    def run_maintenance_checks():
        report.add_result(check_todos(project_path))
        report.add_result(check_import_consistency(project_path, report))

    # Exécuter tous les checks
    for check in basic_checks:
        try:
            result = check(project_path)
            report.add_result(result)
        except Exception as e:
            report.add_result(
                AuditResult(
                    name=check.__name__,
                    score_impact=-5,
                    details=f"Erreur: {e}",
                    passed=False,
                    category="quality",
                )
            )

    run_arch_checks()
    run_security_checks()
    run_maintenance_checks()

    report.compute_grade()
    return report


def print_report(report: AuditReport) -> None:
    """Affiche le rapport en format lisible."""
    print()
    print("=" * 60)
    print(f"  SCORE QUALITÉ: {report.score}/100  (Grade: {report.grade})")
    print("=" * 60)
    print()

    # Grouper par catégorie
    categories = {"quality": "Qualité", "architecture": "Architecture",
                  "security": "Sécurité", "maintenance": "Maintenance"}

    for cat_key, cat_name in categories.items():
        cat_results = [r for r in report.results if r.category == cat_key]
        if cat_results:
            print(f"  [{cat_name}]")
            for result in cat_results:
                status = "✅" if result.passed else "❌"
                impact = f"({result.score_impact:+d})" if result.score_impact != 0 else ""
                print(f"    {status} {result.name}: {result.details} {impact}")
            print()

    if report.warnings:
        print("  [⚠️  Warnings]")
        for warning in report.warnings:
            print(f"    • {warning}")
        print()

    print("=" * 60)


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit qualité code Python")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument(
        "--fail-under", type=int, default=0, help="Score minimum requis"
    )
    parser.add_argument("--path", type=str, default=".", help="Chemin du projet")
    args = parser.parse_args()

    project_path = Path(args.path).resolve()
    report = run_audit(project_path)

    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print_report(report)

    if report.score < args.fail_under:
        if not args.json:
            print(f"❌ Score {report.score} < seuil {args.fail_under}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
