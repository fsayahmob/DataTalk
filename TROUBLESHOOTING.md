# 🔧 Troubleshooting - Pourquoi Il Y A Eu Tous Ces Bugs

## 📊 Résumé de la Situation

**Bug principal** : `TypeError: get_setting() takes 1 positional argument but 2 were given`

**Impact** : L'endpoint `/catalog/enrich` retournait "Internal Server Error" au lieu d'enrichir les tables.

---

## 🔍 Analyse des Causes Racines

### 1. **Absence de Tests Automatisés** ⚠️

**Problème** : Aucun test unitaire ou test d'intégration dans le projet.

**Conséquence** : Les bugs ne sont détectés qu'au runtime par les utilisateurs.

**Solution** :
```bash
# Créer des tests avec pytest
cd backend
mkdir tests

# tests/test_catalog.py
def test_get_setting_with_default():
    from catalog import get_setting
    result = get_setting("nonexistent", "default_value")
    assert result == "default_value"

def test_enrich_endpoint():
    response = client.post("/catalog/enrich", json={"table_ids": [1, 2]})
    assert response.status_code == 200
    assert "run_id" in response.json()

# Lancer les tests
pytest tests/
```

**Recommandation** : Viser **80% de couverture** minimum sur les fonctions critiques (CRUD, endpoints API).

---

### 2. **Pas de Type Checking Activé** ⚠️

**Problème** : Le script `analyze-code.sh` a trouvé **9 erreurs mypy**.

**Conséquence** : Les erreurs de signature de fonction ne sont pas détectées avant l'exécution.

**Solution** :
```bash
# Installer mypy
pip install mypy

# Créer mypy.ini
cat > mypy.ini << 'EOF'
[mypy]
python_version = 3.12
strict = True
warn_return_any = True
warn_unused_configs = True
disallow_untyped_defs = True
EOF

# Lancer mypy
mypy backend/ --exclude venv/

# Corriger les erreurs détectées
```

**Si mypy avait été activé**, il aurait détecté l'erreur à la ligne 1120 :
```
backend/main.py:1120: error: Too many arguments for "get_setting"
```

---

### 3. **Linting Non Strict** ⚠️

**Problème** : **325 erreurs ruff** (imports mal triés, variables non utilisées, etc.)

**Conséquence** : Code difficile à lire et maintenir, bugs cachés dans le bruit.

**Solution** :
```bash
# Installer ruff
pip install ruff

# Configuration stricte dans pyproject.toml
cat >> pyproject.toml << 'EOF'
[tool.ruff]
line-length = 120
select = ["E", "F", "I", "N", "W", "B", "C90"]
ignore = []

[tool.ruff.per-file-ignores]
"__init__.py" = ["F401"]
EOF

# Auto-fix les problèmes
ruff check --fix backend/

# Intégrer dans pre-commit hook
```

---

### 4. **Chemins de Base de Données Hardcodés** ⚠️

**Problème** : Le chemin de la base SQLite est hardcodé dans [db.py:10](backend/db.py:10) :
```python
CATALOG_PATH = os.path.join(os.path.dirname(__file__), "catalog.sqlite")
```

**Conséquence** :
- Difficile de tester avec une base de données de test
- Confusion entre 4 fichiers SQLite différents dans le projet
- Impossible de configurer le chemin via variable d'environnement

**Solution** :
```python
# backend/db.py (amélioré)
import os
import sqlite3

CATALOG_PATH = os.getenv("CATALOG_DB_PATH",
                         os.path.join(os.path.dirname(__file__), "catalog.sqlite"))

def get_connection() -> sqlite3.Connection:
    """Retourne une connexion au catalogue SQLite."""
    conn = sqlite3.connect(CATALOG_PATH)
    conn.row_factory = sqlite3.Row
    return conn
```

**Puis dans `.env`** :
```bash
CATALOG_DB_PATH=backend/catalog.sqlite
```

---

### 5. **Perte de Contexte dans les Sessions Longues** ⚠️

**Problème** : Le système indique :
> "This session is being continued from a previous conversation that ran out of context."

**Conséquence** :
- Historique de décisions perdues
- Incohérences entre le code écrit à différentes sessions
- Oubli de contraintes ou de choix architecturaux

**Solution** :
1. **Documenter les décisions** dans des fichiers ADR (Architecture Decision Records)
2. **Commenter le code** avec le "pourquoi", pas le "quoi"
3. **Utiliser des TODO structurés** avec contexte

Exemple :
```python
def get_setting(key: str, default: str | None = None) -> str | None:
    """
    Récupère une valeur de configuration depuis SQLite.

    Args:
        key: Clé de configuration (ex: "duckdb_path")
        default: Valeur par défaut si la clé n'existe pas

    Returns:
        La valeur stockée ou `default` si non trouvée

    Note:
        Le paramètre `default` a été ajouté le 2026-01-12 pour permettre
        des appels type get_setting("max_tables_per_batch", "15").
        Avant, il fallait faire get_setting(...) or "15" à chaque appel.
    """
```

---

## ✅ Corrections Appliquées

### Fix 1 : Signature de `get_setting()` ✓

**Avant** ([catalog.py:387](backend/catalog.py:387)) :
```python
def get_setting(key: str) -> str | None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    result = cursor.fetchone()
    conn.close()
    return result["value"] if result else None
```

**Après** :
```python
def get_setting(key: str, default: str | None = None) -> str | None:
    """Récupère une valeur de configuration."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        result = cursor.fetchone()
        return result["value"] if result else default
    finally:
        conn.close()  # ✓ Aussi corrigé le memory leak
```

**Bénéfices** :
- ✓ Appels simplifiés : `get_setting("key", "default")`
- ✓ Memory leak corrigé avec `try/finally`
- ✓ Compatible avec tous les appels existants (default=None par défaut)

### Fix 2 : Appel dans `main.py` ✓

**Avant** ([main.py:1120](backend/main.py:1120)) :
```python
max_tables_per_batch = int(get_setting("max_tables_per_batch") or "15")
```

**Après** :
```python
max_tables_per_batch = int(get_setting("max_tables_per_batch", "15"))
```

---

## 🛡️ Recommandations pour l'Avenir

### Immédiat (Cette Semaine)

1. **Ajouter des tests critiques** :
   ```bash
   pytest tests/test_catalog.py
   pytest tests/test_endpoints.py
   ```

2. **Activer mypy** :
   ```bash
   mypy backend/ --strict
   ```

3. **Nettoyer les erreurs ruff** :
   ```bash
   ruff check --fix backend/
   ```

4. **Documenter les fonctions critiques** avec docstrings complètes

### Court Terme (Ce Mois)

5. **Pre-commit hooks** :
   ```yaml
   # .pre-commit-config.yaml
   repos:
     - repo: https://github.com/astral-sh/ruff-pre-commit
       hooks:
         - id: ruff
         - id: ruff-format
     - repo: https://github.com/pre-commit/mirrors-mypy
       hooks:
         - id: mypy
   ```

6. **CI/CD Pipeline** (GitHub Actions) :
   ```yaml
   # .github/workflows/test.yml
   name: Tests
   on: [push, pull_request]
   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - name: Run tests
           run: pytest tests/
         - name: Type check
           run: mypy backend/
   ```

### Long Terme (Ce Trimestre)

7. **Tests d'intégration end-to-end**
8. **Monitoring et alertes** (Sentry pour les erreurs)
9. **Code coverage** (>80% sur les fonctions critiques)
10. **Architecture Decision Records** (ADR) pour documenter les choix

---

## 📚 Ressources

- [pytest documentation](https://docs.pytest.org/)
- [mypy documentation](https://mypy.readthedocs.io/)
- [ruff documentation](https://docs.astral.sh/ruff/)
- [Pre-commit hooks](https://pre-commit.com/)
- [ADR (Architecture Decision Records)](https://adr.github.io/)

---

## 🎯 Checklist Avant Chaque Commit

```bash
# 1. Lancer les tests
pytest tests/

# 2. Type checking
mypy backend/

# 3. Linting
ruff check backend/

# 4. Formater le code
ruff format backend/

# 5. Vérifier les imports
ruff check --select I backend/

# 6. Si tout est vert, commit!
git add .
git commit -m "feat: votre message"
```

---

**Date de création** : 2026-01-12
**Dernière mise à jour** : 2026-01-12
**Auteur** : Documentation automatique suite à incident
