# Migration SQLite → PostgreSQL - DataTalk

## Executive Summary

| Métrique | Valeur |
|----------|--------|
| **Fichiers impactés** | 50+ |
| **Lignes à modifier** | ~250 |
| **Patterns à migrer** | 7 majeurs |
| **Complexité** | MODÉRÉE |
| **Risque** | FAIBLE (patterns répétitifs) |

## Motivation

SQLite souffre de limitations de concurrence critique :
- **Single writer** : Une seule écriture à la fois
- **Database locked** : Worker Celery bloqué pendant que l'API poll
- **WAL mode insuffisant** : busy_timeout de 30s dépassé lors d'extractions longues

PostgreSQL résout ces problèmes nativement avec son MVCC (Multi-Version Concurrency Control).

---

## Patterns de Migration

### 1. Paramètres de requête

```python
# SQLite
cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))

# PostgreSQL
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

**Fichiers impactés** : ~200 occurrences dans catalog/, llm_config/, catalog_engine/

### 2. Récupération d'ID après INSERT

```python
# SQLite
cursor.execute("INSERT INTO users (name) VALUES (?)", (name,))
user_id = cursor.lastrowid

# PostgreSQL
cursor.execute("INSERT INTO users (name) VALUES (%s) RETURNING id", (name,))
user_id = cursor.fetchone()[0]
```

**Fichiers impactés** : 10 fichiers catalog/, ~30 occurrences

### 3. INSERT OR REPLACE → ON CONFLICT

```python
# SQLite
cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, v))

# PostgreSQL
cursor.execute("""
    INSERT INTO settings (key, value) VALUES (%s, %s)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
""", (k, v))
```

**Fichiers impactés** : tables.py, settings.py, widgets.py, secrets.py (~10 occurrences)

### 4. INSERT OR IGNORE → ON CONFLICT DO NOTHING

```python
# SQLite
cursor.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (name,))

# PostgreSQL
cursor.execute("INSERT INTO tags (name) VALUES (%s) ON CONFLICT DO NOTHING", (name,))
```

**Fichiers impactés** : schema.sql (37 INSERT initiaux)

### 5. Fonctions de date

```python
# SQLite
cursor.execute("WHERE created_at > datetime('now', '-7 days')")
cursor.execute("SELECT strftime('%Y-%m-%d', created_at)")

# PostgreSQL
cursor.execute("WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'")
cursor.execute("SELECT TO_CHAR(created_at, 'YYYY-MM-DD')")
```

**Fichiers impactés** : costs.py, maintenance.py (~10 occurrences)

### 6. Types AUTOINCREMENT

```sql
-- SQLite
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT);

-- PostgreSQL
CREATE TABLE users (id SERIAL PRIMARY KEY);
```

**Fichiers impactés** : schema.sql (15 tables)

### 7. Booléens

```sql
-- SQLite
WHERE is_active = 1
WHERE is_enabled = 0

-- PostgreSQL
WHERE is_active = true
WHERE is_enabled = false
```

**Fichiers impactés** : models.py, providers.py, costs.py (~20 occurrences)

---

## Fichiers à Modifier

### Critiques (couche connexion)

| Fichier | Changements |
|---------|-------------|
| `backend/db.py` | psycopg2.connect(), supprimer PRAGMAs |
| `backend/schema.sql` | SERIAL, ON CONFLICT, booleans |
| `backend/db_migrations.py` | information_schema au lieu de PRAGMA |

### Catalog CRUD (10 fichiers)

| Fichier | ? → %s | lastrowid | INSERT OR |
|---------|--------|-----------|-----------|
| conversations.py | ✓ | ✓ | - |
| messages.py | ✓ | ✓ | - |
| datasets.py | ✓ | ✓ | - |
| datasources.py | ✓ | ✓ | - |
| jobs.py | ✓ | ✓ | - |
| tables.py | ✓ | ✓ | ✓ REPLACE |
| columns.py | ✓ | ✓ | ✓ REPLACE |
| reports.py | ✓ | ✓ | - |
| settings.py | ✓ | - | ✓ REPLACE |
| questions.py | ✓ | ✓ | - |
| widgets.py | ✓ | ✓ | ✓ REPLACE |

### LLM Config (6 fichiers)

| Fichier | ? → %s | lastrowid | datetime() |
|---------|--------|-----------|------------|
| costs.py | ✓ | ✓ | ✓ strftime |
| models.py | ✓ | - | - |
| prompts.py | ✓ | ✓ | - |
| providers.py | ✓ | - | - |
| secrets.py | ✓ | - | ✓ REPLACE |

### Tasks Celery

| Fichier | Changements |
|---------|-------------|
| tasks/maintenance.py | datetime() → INTERVAL |

### Docker

| Fichier | Changements |
|---------|-------------|
| docker-compose.yml | Ajouter service postgres |
| backend/requirements.txt | Ajouter psycopg2-binary |

---

## Plan d'Exécution

### Phase 1 : Infrastructure
1. ✅ Commit état actuel (renommage G7→DataTalk)
2. Ajouter PostgreSQL dans docker-compose.yml
3. Ajouter psycopg2-binary dans requirements.txt
4. Modifier db.py pour PostgreSQL

### Phase 2 : Schéma
5. Convertir schema.sql en syntaxe PostgreSQL
6. Adapter db_migrations.py (PRAGMA → information_schema)

### Phase 3 : Code CRUD
7. Migrer catalog/*.py (10 fichiers)
8. Migrer llm_config/*.py (6 fichiers)
9. Migrer catalog_engine/*.py
10. Migrer tasks/maintenance.py

### Phase 4 : Validation
11. Adapter tests unitaires
12. Tests d'intégration
13. Tests de charge concurrence

---

## Configuration Docker

### Nouveau service PostgreSQL

```yaml
postgres:
  container_name: datatalk-postgres
  image: postgres:16-alpine
  environment:
    POSTGRES_DB: datatalk
    POSTGRES_USER: datatalk
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-datatalk_dev}
  volumes:
    - postgres-data:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U datatalk"]
    interval: 10s
    timeout: 5s
    retries: 5
  restart: always
  networks:
    - datatalk-net
```

### Variables d'environnement

```yaml
api:
  environment:
    - DATABASE_URL=postgresql://datatalk:${POSTGRES_PASSWORD:-datatalk_dev}@postgres:5432/datatalk
    # Supprimer: SQLITE_PATH

worker:
  environment:
    - DATABASE_URL=postgresql://datatalk:${POSTGRES_PASSWORD:-datatalk_dev}@postgres:5432/datatalk
    # Supprimer: SQLITE_PATH
```

---

## Rollback Strategy

En cas de problème :
1. Les données DuckDB (analytics) ne sont pas impactées
2. Backup SQLite avant migration
3. Variable d'environnement `DATABASE_TYPE=sqlite|postgres` pour switch rapide

---

## Checklist Finale

- [ ] docker-compose.yml avec PostgreSQL
- [ ] psycopg2-binary dans requirements.txt
- [ ] db.py adapté
- [ ] schema.sql converti
- [ ] db_migrations.py adapté
- [ ] Tous catalog/*.py migrés
- [ ] Tous llm_config/*.py migrés
- [ ] catalog_engine/*.py migré
- [ ] tasks/maintenance.py migré
- [ ] Tests passent
- [ ] Documentation mise à jour
