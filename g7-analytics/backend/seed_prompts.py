"""
Script de seed pour les prompts LLM.
Insère les prompts analytics et catalog dans la table llm_prompts.

Usage:
  python seed_prompts.py          # Ajoute uniquement les prompts manquants
  python seed_prompts.py --force  # Met à jour tous les prompts (écrase les existants)
"""
import sys

from llm_config import add_prompt, get_prompt, init_llm_tables, update_prompt

# ========================================
# PROMPTS ANALYTICS
# ========================================

ANALYTICS_SYSTEM_NORMAL = """Assistant analytique SQL. Réponds en français.

{schema}

TYPES DE GRAPHIQUES:
- bar: comparaisons entre catégories
- line: évolutions temporelles
- pie: répartitions (max 10 items)
- area: évolutions empilées
- scatter: corrélations
- none: pas de visualisation

RÈGLES SQL:
- SQL DuckDB uniquement (SELECT)
- Alias en français
- ORDER BY pour rankings/évolutions
- LIMIT: "top N"→N, "tous"→pas de limit, défaut→500
- Agrégations (GROUP BY)→pas de LIMIT
- DUCKDB TIME: EXTRACT(HOUR FROM col), pas strftime

MULTI-SÉRIES (comparaison par catégorie):
Pour comparer plusieurs séries sur un même graphique:
1. SQL avec FILTER pour créer une colonne par catégorie:
   SELECT date,
     AVG(valeur) FILTER (WHERE type='A') AS "Type A",
     AVG(valeur) FILTER (WHERE type='B') AS "Type B"
   FROM table GROUP BY date
2. chart.y DOIT être un tableau: ["Type A", "Type B", ...]

RÉPONSE: Un seul objet JSON (pas de tableau):
{{"sql":"SELECT...","message":"Explication...","chart":{{"type":"...","x":"col","y":"col|[cols]","title":"..."}}}}"""

ANALYTICS_SYSTEM_OPTIMIZED = """Assistant SQL analytique. Français.

{schema}

CHARTS: bar|line|pie|area|scatter|none
SQL: DuckDB SELECT, alias FR, ORDER BY, LIMIT défaut 500
TEMPS: EXTRACT(HOUR FROM col)
MULTI-SÉRIES: FILTER + chart.y tableau

JSON: {{"sql":"...","message":"...","chart":{{"type":"...","x":"...","y":"...|[...]","title":"..."}}}}"""

# ========================================
# PROMPTS CATALOG
# ========================================

CATALOG_ENRICHMENT_NORMAL = """Tu es un expert en data catalog. Analyse cette structure de base de données et génère des descriptions sémantiques.

STRUCTURE À DOCUMENTER:
{tables_context}

INSTRUCTIONS:
- Déduis le contexte métier à partir des noms et des exemples de valeurs
- Génère des descriptions claires en français
- Pour chaque colonne, propose 2-3 synonymes (termes alternatifs pour recherche NLP)
- Descriptions concises mais complètes"""


def seed_prompts(force: bool = False):
    """Insère les prompts par défaut.

    Args:
        force: Si True, met à jour les prompts existants avec le nouveau contenu.
    """
    init_llm_tables()

    prompts_to_add = [
        # Analytics - Normal
        {
            "key": "analytics_system",
            "name": "Analytics System (Normal)",
            "category": "analytics",
            "content": ANALYTICS_SYSTEM_NORMAL,
            "version": "normal",
            "is_active": True,
            "tokens_estimate": 600,
            "description": "Prompt système pour l'analyse Text-to-SQL. Inclut le schéma DB via {schema}."
        },
        # Analytics - Optimized
        {
            "key": "analytics_system",
            "name": "Analytics System (Optimisé)",
            "category": "analytics",
            "content": ANALYTICS_SYSTEM_OPTIMIZED,
            "version": "optimized",
            "is_active": False,
            "tokens_estimate": 150,
            "description": "Version compacte du prompt analytics. Réduit les tokens de ~75%."
        },
        # Catalog
        {
            "key": "catalog_enrichment",
            "name": "Catalog Enrichment",
            "category": "catalog",
            "content": CATALOG_ENRICHMENT_NORMAL,
            "version": "normal",
            "is_active": True,
            "tokens_estimate": 200,
            "description": "Génération de descriptions sémantiques pour le catalogue. Placeholder {tables_context}."
        },
    ]

    added = 0
    updated = 0
    skipped = 0

    for prompt in prompts_to_add:
        # Vérifier si le prompt existe déjà
        existing = get_prompt(prompt["key"], prompt["version"])
        if existing:
            if force:
                # Mettre à jour le prompt existant
                success = update_prompt(
                    existing["id"],
                    content=prompt["content"],
                    name=prompt["name"],
                    tokens_estimate=prompt.get("tokens_estimate"),
                    description=prompt.get("description")
                )
                if success:
                    print(f"  [UPD] {prompt['key']} ({prompt['version']}) - mis à jour")
                    updated += 1
                else:
                    print(f"  [ERR] {prompt['key']} ({prompt['version']}) - échec mise à jour")
            else:
                print(f"  [SKIP] {prompt['key']} ({prompt['version']}) - existe déjà")
                skipped += 1
            continue

        # Ajouter le prompt
        prompt_id = add_prompt(**prompt)
        if prompt_id:
            print(f"  [ADD] {prompt['key']} ({prompt['version']}) - ID: {prompt_id}")
            added += 1
        else:
            print(f"  [ERR] {prompt['key']} ({prompt['version']}) - échec insertion")

    print(f"\nRésumé: {added} ajoutés, {updated} mis à jour, {skipped} ignorés")
    return added, updated, skipped


if __name__ == "__main__":
    force_update = "--force" in sys.argv
    if force_update:
        print("Seed des prompts LLM (mode FORCE - mise à jour)...")
    else:
        print("Seed des prompts LLM...")
    seed_prompts(force=force_update)
    print("Done!")
