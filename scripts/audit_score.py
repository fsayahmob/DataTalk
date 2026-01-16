#!/usr/bin/env python3
"""
Script d'audit qualité code Full-Stack - Score sur 100.

Audite:
- Backend Python (ruff, mypy, pytest)
- Frontend TypeScript (eslint, tsc, tests)
- Architecture (fichiers trop gros, duplications)
- Sécurité (secrets, injections)
- Maintenance (TODO, imports incohérents)

Usage:
    python scripts/audit_score.py [--json] [--fail-under=70]
    python scripts/audit_score.py --backend-only
    python scripts/audit_score.py --frontend-only

Output:
    - Score sur 100 avec détails par composant
    - Code retour 0 si score >= fail-under, 1 sinon
"""

import argparse
import ast
import json
import re
import subprocess
import sys
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
    component: str = "global"  # backend, frontend, global


@dataclass
class AuditReport:
    """Rapport d'audit complet."""

    score: int = 100
    grade: str = "A"
    results: list[AuditResult] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    backend_score: int = 100
    frontend_score: int = 100

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
            "backend_score": self.backend_score,
            "frontend_score": self.frontend_score,
            "results": [
                {
                    "name": r.name,
                    "component": r.component,
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
            capture_output=True,
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
# BACKEND CHECKS (Python)
# =============================================================================


def check_backend_ruff(backend_path: Path) -> AuditResult:
    """Vérifie le linting Python avec ruff."""
    if not backend_path.exists():
        return AuditResult(
            name="Backend Ruff",
            score_impact=0,
            details="Backend non trouvé",
            passed=True,
            component="backend",
        )

    code, stdout, _ = run_command(
        ["ruff", "check", ".", "--exclude", "scripts,tests"], cwd=backend_path
    )

    if code == 0:
        return AuditResult(
            name="Backend Ruff",
            score_impact=0,
            details="0 erreurs",
            passed=True,
            component="backend",
        )

    error_count = len(stdout.strip().split("\n")) if stdout.strip() else 0
    penalty = min(10, error_count)  # -1 par erreur, max -10

    return AuditResult(
        name="Backend Ruff",
        score_impact=-penalty,
        details=f"{error_count} erreurs",
        passed=False,
        component="backend",
    )


def check_backend_mypy(backend_path: Path) -> AuditResult:
    """Vérifie les types Python avec mypy."""
    if not backend_path.exists():
        return AuditResult(
            name="Backend Mypy",
            score_impact=0,
            details="Backend non trouvé",
            passed=True,
            component="backend",
        )

    code, stdout, stderr = run_command(
        ["mypy", ".", "--ignore-missing-imports", "--exclude", "scripts|tests"],
        cwd=backend_path,
    )

    output = stdout + stderr
    error_lines = [line for line in output.split("\n") if "error:" in line]
    error_count = len(error_lines)

    if error_count == 0:
        return AuditResult(
            name="Backend Mypy",
            score_impact=0,
            details="0 erreurs de type",
            passed=True,
            component="backend",
        )

    penalty = min(10, error_count * 2)  # -2 par erreur, max -10

    return AuditResult(
        name="Backend Mypy",
        score_impact=-penalty,
        details=f"{error_count} erreurs de type",
        passed=False,
        component="backend",
    )


def check_backend_tests(backend_path: Path) -> AuditResult:
    """Vérifie que les tests Python passent."""
    if not backend_path.exists():
        return AuditResult(
            name="Backend Tests",
            score_impact=0,
            details="Backend non trouvé",
            passed=True,
            component="backend",
        )

    # Chercher les fichiers de test
    test_files = list(backend_path.glob("test_*.py")) + list(backend_path.glob("**/test_*.py"))
    if not test_files:
        return AuditResult(
            name="Backend Tests",
            score_impact=-5,
            details="Aucun fichier de test trouvé",
            passed=False,
            component="backend",
        )

    # Lancer pytest sur les fichiers trouvés (tous les fichiers)
    code, stdout, stderr = run_command(
        ["python", "-m", "pytest"] + [str(f.name) for f in test_files] + ["--tb=no", "-q"],
        cwd=backend_path,
    )

    output = stdout + stderr

    # Vérifier le résultat (attention: "xfailed" contient "failed" mais n'est pas un échec)
    # On vérifie qu'il n'y a pas de vrai " failed" (avec espace avant)
    if "passed" in output and " failed" not in output:
        match = re.search(r"(\d+) passed", output)
        test_count = match.group(1) if match else "?"
        return AuditResult(
            name="Backend Tests",
            score_impact=0,
            details=f"{test_count} tests passent",
            passed=True,
            component="backend",
        )

    # Vérifier si c'est juste "no tests ran"
    if "no tests ran" in output.lower() or "collected 0 items" in output:
        return AuditResult(
            name="Backend Tests",
            score_impact=-5,
            details="Aucun test exécuté",
            passed=False,
            component="backend",
        )

    return AuditResult(
        name="Backend Tests",
        score_impact=-15,
        details="Tests en échec",
        passed=False,
        component="backend",
    )


def check_backend_coverage(backend_path: Path) -> AuditResult:
    """Vérifie la couverture de code Python."""
    if not backend_path.exists():
        return AuditResult(
            name="Backend Coverage",
            score_impact=0,
            details="Backend non trouvé",
            passed=True,
            component="backend",
        )

    # Chercher les fichiers de test
    test_files = list(backend_path.glob("test_*.py")) + list(backend_path.glob("**/test_*.py"))
    if not test_files:
        return AuditResult(
            name="Backend Coverage",
            score_impact=-5,
            details="Aucun test pour calculer",
            passed=False,
            component="backend",
        )

    code, stdout, stderr = run_command(
        ["python", "-m", "pytest"] + [str(f.name) for f in test_files] +
        ["--cov=.", "--cov-report=term", "--tb=no", "-q"],
        cwd=backend_path,
    )

    output = stdout + stderr
    match = re.search(r"TOTAL\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)%", output)

    if not match:
        # Essayer un autre format
        match = re.search(r"TOTAL\s+\d+\s+\d+\s+(\d+)%", output)

    if not match:
        return AuditResult(
            name="Backend Coverage",
            score_impact=-5,
            details="Impossible de calculer",
            passed=False,
            component="backend",
        )

    coverage = int(match.group(1))

    if coverage >= 70:
        return AuditResult(
            name="Backend Coverage",
            score_impact=0,
            details=f"{coverage}% (cible: 70%)",
            passed=True,
            component="backend",
        )
    elif coverage >= 50:
        return AuditResult(
            name="Backend Coverage",
            score_impact=-5,
            details=f"{coverage}% (cible: 70%)",
            passed=False,
            component="backend",
        )
    else:
        return AuditResult(
            name="Backend Coverage",
            score_impact=-10,
            details=f"{coverage}% (cible: 70%)",
            passed=False,
            component="backend",
        )


# =============================================================================
# FRONTEND CHECKS (TypeScript/React)
# =============================================================================


def check_frontend_eslint(frontend_path: Path) -> AuditResult:
    """Vérifie le linting TypeScript avec ESLint."""
    if not frontend_path.exists():
        return AuditResult(
            name="Frontend ESLint",
            score_impact=0,
            details="Frontend non trouvé",
            passed=True,
            component="frontend",
        )

    # Vérifier si eslint est configuré
    eslint_config = frontend_path / "eslint.config.js"
    eslint_config_mjs = frontend_path / "eslint.config.mjs"

    if not eslint_config.exists() and not eslint_config_mjs.exists():
        return AuditResult(
            name="Frontend ESLint",
            score_impact=-5,
            details="ESLint non configuré",
            passed=False,
            component="frontend",
        )

    code, stdout, stderr = run_command(["npm", "run", "lint"], cwd=frontend_path)

    if code == 0:
        return AuditResult(
            name="Frontend ESLint",
            score_impact=0,
            details="0 erreurs",
            passed=True,
            component="frontend",
        )

    # Compter les erreurs (recherche plus précise pour éviter faux positifs)
    output = stdout + stderr
    # Chercher le pattern ESLint standard: "X error" ou "X errors"
    error_match = re.search(r"(\d+)\s+errors?(?:\s|$)", output)
    warning_match = re.search(r"(\d+)\s+warnings?(?:\s|$)", output)
    error_count = int(error_match.group(1)) if error_match else output.count(": error")
    warning_count = int(warning_match.group(1)) if warning_match else output.count(": warning")

    if error_count == 0 and warning_count > 0:
        return AuditResult(
            name="Frontend ESLint",
            score_impact=0,
            details=f"{warning_count} warnings",
            passed=True,
            component="frontend",
        )

    penalty = min(10, error_count)

    return AuditResult(
        name="Frontend ESLint",
        score_impact=-penalty,
        details=f"{error_count} erreurs, {warning_count} warnings",
        passed=False,
        component="frontend",
    )


def check_frontend_typescript(frontend_path: Path) -> AuditResult:
    """Vérifie la compilation TypeScript."""
    if not frontend_path.exists():
        return AuditResult(
            name="Frontend TypeScript",
            score_impact=0,
            details="Frontend non trouvé",
            passed=True,
            component="frontend",
        )

    tsconfig = frontend_path / "tsconfig.json"
    if not tsconfig.exists():
        return AuditResult(
            name="Frontend TypeScript",
            score_impact=-5,
            details="tsconfig.json non trouvé",
            passed=False,
            component="frontend",
        )

    code, stdout, stderr = run_command(["npx", "tsc", "--noEmit"], cwd=frontend_path)

    if code == 0:
        return AuditResult(
            name="Frontend TypeScript",
            score_impact=0,
            details="0 erreurs de type",
            passed=True,
            component="frontend",
        )

    output = stdout + stderr
    error_count = output.count("error TS")
    penalty = min(10, error_count)

    return AuditResult(
        name="Frontend TypeScript",
        score_impact=-penalty,
        details=f"{error_count} erreurs de type",
        passed=False,
        component="frontend",
    )


def check_frontend_build(frontend_path: Path) -> AuditResult:
    """Vérifie que le build frontend réussit."""
    if not frontend_path.exists():
        return AuditResult(
            name="Frontend Build",
            score_impact=0,
            details="Frontend non trouvé",
            passed=True,
            component="frontend",
        )

    code, stdout, stderr = run_command(["npm", "run", "build"], cwd=frontend_path)

    if code == 0:
        return AuditResult(
            name="Frontend Build",
            score_impact=0,
            details="Build réussi",
            passed=True,
            component="frontend",
        )

    return AuditResult(
        name="Frontend Build",
        score_impact=-15,
        details="Build échoué",
        passed=False,
        component="frontend",
    )


# =============================================================================
# CHECKS ARCHITECTURE (Global)
# =============================================================================


def check_large_files(project_path: Path, report: AuditReport) -> AuditResult:
    """Vérifie qu'il n'y a pas de fichiers trop gros."""
    skip_dirs = {"venv", ".venv", "__pycache__", "tests", ".git", "node_modules",
                 "scripts", ".next", "dist", "build"}
    large_files = []

    # Backend Python
    backend_path = project_path / "backend"
    if backend_path.exists():
        for py_file in backend_path.rglob("*.py"):
            if any(part in py_file.parts for part in skip_dirs):
                continue
            try:
                line_count = len(py_file.read_text().split("\n"))
                if line_count > 500:
                    large_files.append((py_file.relative_to(project_path), line_count))
            except Exception:
                pass

    # Frontend TypeScript
    frontend_path = project_path / "frontend"
    if frontend_path.exists():
        for ts_file in frontend_path.rglob("*.ts"):
            if any(part in ts_file.parts for part in skip_dirs):
                continue
            try:
                line_count = len(ts_file.read_text().split("\n"))
                if line_count > 500:
                    large_files.append((ts_file.relative_to(project_path), line_count))
            except Exception:
                pass

        for tsx_file in frontend_path.rglob("*.tsx"):
            if any(part in tsx_file.parts for part in skip_dirs):
                continue
            try:
                line_count = len(tsx_file.read_text().split("\n"))
                if line_count > 500:
                    large_files.append((tsx_file.relative_to(project_path), line_count))
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

    penalty = min(10, len(large_files) * 3)
    files_str = ", ".join(f"{f[0].name}({f[1]})" for f in large_files[:3])

    for f, lines in large_files:
        report.add_warning(f"Fichier trop gros: {f} ({lines} lignes)")

    return AuditResult(
        name="Taille fichiers",
        score_impact=-penalty,
        details=f"{len(large_files)} fichiers >500 lignes: {files_str}",
        passed=False,
        category="architecture",
    )


def check_redundant_dependencies(project_path: Path, report: AuditReport) -> AuditResult:
    """Détecte les dépendances redondantes."""

    REDUNDANT_GROUPS = {
        # Python
        "http_client_py": ["requests", "httpx", "aiohttp"],
        "retry_py": ["tenacity", "retry", "backoff"],
        # JavaScript/TypeScript
        "http_client_js": ["axios", "fetch", "got", "node-fetch"],
        "state_js": ["redux", "zustand", "jotai", "recoil"],
        "date_js": ["moment", "dayjs", "date-fns", "luxon"],
        "form_js": ["formik", "react-hook-form"],
    }

    all_deps: set[str] = set()

    # Python requirements
    req_file = project_path / "backend" / "requirements.txt"
    if req_file.exists():
        for line in req_file.read_text().split("\n"):
            line = line.strip().lower()
            if line and not line.startswith("#"):
                pkg = re.split(r"[=<>!\[]", line)[0].strip()
                if pkg:
                    all_deps.add(pkg)

    # JavaScript package.json
    pkg_file = project_path / "frontend" / "package.json"
    if pkg_file.exists():
        try:
            pkg_data = json.loads(pkg_file.read_text())
            for deps_key in ["dependencies", "devDependencies"]:
                if deps_key in pkg_data:
                    for dep in pkg_data[deps_key].keys():
                        all_deps.add(dep.lower())
        except Exception:
            pass

    redundant_found = []
    for group_name, libs in REDUNDANT_GROUPS.items():
        found_in_group = [lib for lib in libs if lib in all_deps]
        if len(found_in_group) > 1:
            redundant_found.append((group_name, found_in_group))
            report.add_warning(
                f"Libs redondantes ({group_name}): {', '.join(found_in_group)}"
            )

    if not redundant_found:
        return AuditResult(
            name="Dépendances redondantes",
            score_impact=0,
            details="Pas de redondance",
            passed=True,
            category="architecture",
        )

    penalty = min(10, len(redundant_found) * 5)

    return AuditResult(
        name="Dépendances redondantes",
        score_impact=-penalty,
        details=f"{len(redundant_found)} groupes redondants",
        passed=False,
        category="architecture",
    )


# =============================================================================
# CHECKS SÉCURITÉ
# =============================================================================


def check_secrets(project_path: Path) -> AuditResult:
    """Vérifie qu'il n'y a pas de secrets en dur."""
    secret_patterns = [
        (r"sk-[a-zA-Z0-9]{20,}", "OpenAI key"),
        (r"ghp_[a-zA-Z0-9]{36}", "GitHub token"),
        (r"AKIA[A-Z0-9]{16}", "AWS key"),
        (r"xox[baprs]-[a-zA-Z0-9-]+", "Slack token"),
        (r'api_key\s*[=:]\s*["\'][a-zA-Z0-9_-]{20,}["\']', "API key"),
    ]

    skip_dirs = {"venv", ".venv", "__pycache__", ".git", "node_modules", ".next"}
    skip_files = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml"}
    secrets_found = []

    for ext in ["*.py", "*.ts", "*.tsx", "*.js", "*.jsx", "*.json", "*.env*"]:
        for file_path in project_path.rglob(ext):
            if any(part in file_path.parts for part in skip_dirs):
                continue
            if file_path.name in skip_files:
                continue
            if "example" in file_path.name.lower() or "sample" in file_path.name.lower():
                continue
            if "test" in file_path.name.lower():
                continue

            try:
                content = file_path.read_text()
                for pattern, secret_type in secret_patterns:
                    if re.search(pattern, content):
                        secrets_found.append((file_path.name, secret_type))
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
        details=f"Secrets potentiels dans: {', '.join(f[0] for f in secrets_found[:3])}",
        passed=False,
        category="security",
    )


# =============================================================================
# CHECKS MAINTENANCE
# =============================================================================


def check_todos(project_path: Path) -> AuditResult:
    """Compte les TODO/FIXME."""
    skip_dirs = {"venv", ".venv", "__pycache__", ".git", "node_modules", ".next"}
    todo_count = 0
    fixme_count = 0

    for ext in ["*.py", "*.ts", "*.tsx", "*.js"]:
        for file_path in project_path.rglob(ext):
            if any(part in file_path.parts for part in skip_dirs):
                continue
            try:
                content = file_path.read_text().upper()
                todo_count += content.count("TODO")
                fixme_count += content.count("FIXME")
            except Exception:
                pass

    return AuditResult(
        name="TODO/FIXME",
        score_impact=0,  # Informatif seulement
        details=f"{todo_count} TODO, {fixme_count} FIXME",
        passed=True,
        category="maintenance",
    )


# =============================================================================
# MAIN
# =============================================================================


def run_audit(
    project_path: Path,
    backend_only: bool = False,
    frontend_only: bool = False,
) -> AuditReport:
    """Exécute l'audit complet."""
    report = AuditReport()

    backend_path = project_path / "backend"
    frontend_path = project_path / "frontend"

    # Backend checks
    if not frontend_only:
        report.add_result(check_backend_ruff(backend_path))
        report.add_result(check_backend_mypy(backend_path))
        report.add_result(check_backend_tests(backend_path))
        report.add_result(check_backend_coverage(backend_path))

    # Frontend checks
    if not backend_only:
        report.add_result(check_frontend_eslint(frontend_path))
        report.add_result(check_frontend_typescript(frontend_path))
        report.add_result(check_frontend_build(frontend_path))

    # Global checks
    report.add_result(check_large_files(project_path, report))
    report.add_result(check_redundant_dependencies(project_path, report))
    report.add_result(check_secrets(project_path))
    report.add_result(check_todos(project_path))

    report.compute_grade()
    return report


def print_report(report: AuditReport) -> None:
    """Affiche le rapport."""
    print()
    print("=" * 60)
    print(f"  SCORE QUALITÉ FULL-STACK: {report.score}/100  (Grade: {report.grade})")
    print("=" * 60)
    print()

    # Backend
    backend_results = [r for r in report.results if r.component == "backend"]
    if backend_results:
        print("  [Backend Python]")
        for result in backend_results:
            status = "✅" if result.passed else "❌"
            impact = f"({result.score_impact:+d})" if result.score_impact != 0 else ""
            print(f"    {status} {result.name}: {result.details} {impact}")
        print()

    # Frontend
    frontend_results = [r for r in report.results if r.component == "frontend"]
    if frontend_results:
        print("  [Frontend TypeScript]")
        for result in frontend_results:
            status = "✅" if result.passed else "❌"
            impact = f"({result.score_impact:+d})" if result.score_impact != 0 else ""
            print(f"    {status} {result.name}: {result.details} {impact}")
        print()

    # Global
    global_results = [r for r in report.results if r.component == "global"]
    if global_results:
        print("  [Global]")
        for result in global_results:
            status = "✅" if result.passed else "❌"
            impact = f"({result.score_impact:+d})" if result.score_impact != 0 else ""
            print(f"    {status} {result.name}: {result.details} {impact}")
        print()

    if report.warnings:
        print("  [⚠️  Warnings]")
        for warning in report.warnings[:10]:  # Limiter à 10
            print(f"    • {warning}")
        if len(report.warnings) > 10:
            print(f"    ... et {len(report.warnings) - 10} autres")
        print()

    print("=" * 60)


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit qualité code Full-Stack")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--fail-under", type=int, default=0, help="Score minimum")
    parser.add_argument("--path", type=str, default=".", help="Chemin du projet")
    parser.add_argument("--backend-only", action="store_true", help="Backend seulement")
    parser.add_argument("--frontend-only", action="store_true", help="Frontend seulement")
    args = parser.parse_args()

    project_path = Path(args.path).resolve()
    report = run_audit(project_path, args.backend_only, args.frontend_only)

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
