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

CHOIX DE TABLE:
- evaluations: données brutes par course (64K lignes)
- evaluation_categories: données dénormalisées par catégorie avec sentiment_categorie (colonnes: categorie, sentiment_categorie). UTILISER CETTE TABLE pour toute analyse PAR CATÉGORIE.

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
- GROUP BY: TOUJOURS utiliser l'expression complète, PAS l'alias (ex: GROUP BY EXTRACT(MONTH FROM dat_course), pas GROUP BY "Mois")

MULTI-SÉRIES (OBLIGATOIRE pour "par catégorie", "par type", "couleur par X"):
INTERDIT: GROUP BY avec colonne catégorie qui retourne plusieurs lignes par date.
OBLIGATOIRE: Utiliser FILTER pour PIVOTER les données (une colonne par catégorie).

Exemple - Sentiment PAR CATÉGORIE et par jour:
SQL: SELECT dat_course AS jour,
       AVG(sentiment_categorie) FILTER (WHERE categorie='CHAUFFEUR_COMPORTEMENT') AS "Chauffeur",
       AVG(sentiment_categorie) FILTER (WHERE categorie='VEHICULE_PROPRETE') AS "Véhicule",
       AVG(sentiment_categorie) FILTER (WHERE categorie='PRIX_FACTURATION') AS "Prix"
     FROM evaluation_categories GROUP BY dat_course ORDER BY dat_course
chart.y: ["Chauffeur", "Véhicule", "Prix"]

IMPORTANT: chart.y DOIT être un TABLEAU avec les noms de colonnes créées par FILTER.

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

# ========================================
# PROMPTS WIDGETS/KPI GENERATION
# ========================================

WIDGETS_GENERATION_NORMAL = """Tu es un analyste métier expert. Génère exactement 4 KPIs pour ce dashboard.

SCHÉMA DE DONNÉES:
{schema}

PÉRIODE DES DONNÉES:
{data_period}

STRUCTURE D'UN KPI (KpiCompactData):
Chaque KPI a besoin de 3 requêtes SQL:
1. sql_value: Retourne UNE valeur (la métrique actuelle sur toute la période)
2. sql_trend: Retourne UNE valeur de la première moitié de la période (pour calculer le % de variation)
3. sql_sparkline: Retourne 12-15 valeurs ordonnées chronologiquement (historique pour le mini-graphe)

CHAMPS À REMPLIR:
- id: string (slug unique, ex: "total-evaluations")
- title: string (titre court, max 20 caractères)
- sql_value: string (SELECT ... AS value - doit retourner 1 seule ligne)
- sql_trend: string (SELECT ... AS value - première moitié de la période pour comparaison)
- sql_sparkline: string (SELECT value ORDER BY date - 12 à 15 lignes max)
- sparkline_type: "area" | "bar"
- footer: string (texte explicatif court avec la période)
- trend_label: string | null (ex: "vs 1ère quinzaine")

RÈGLES SQL:
- DuckDB uniquement (pas MySQL, pas PostgreSQL)
- sql_value et sql_trend: SELECT qui retourne UNE SEULE LIGNE avec colonne "value"
- sql_sparkline: SELECT qui retourne 12-15 lignes avec colonne "value", ordonnées par date ASC
- Utilise les vraies colonnes de date du schéma
- Adapte la comparaison de tendance à la profondeur des données disponibles

RÉPONSE JSON STRICTE (pas de texte avant/après):
{{
  "kpis": [
    {{
      "id": "total-evaluations",
      "title": "Total Évaluations",
      "sql_value": "SELECT COUNT(*) AS value FROM evaluations",
      "sql_trend": "SELECT COUNT(*) AS value FROM evaluations WHERE dat_course < '2024-05-15'",
      "sql_sparkline": "SELECT COUNT(*) AS value FROM evaluations GROUP BY DATE_TRUNC('day', dat_course) ORDER BY DATE_TRUNC('day', dat_course) LIMIT 15",
      "sparkline_type": "area",
      "footer": "Mai 2024",
      "trend_label": "vs 1ère quinzaine"
    }},
    ...
  ]
}}

CONSIGNES:
- Génère EXACTEMENT 4 KPIs pertinents pour le métier détecté
- Choisis des métriques business importantes (volumes, moyennes, ratios, taux)
- Adapte les requêtes trend à la période disponible (compare 1ère moitié vs total)
- Varie les sparkline_type (2 "area" et 2 "bar")
- footer doit indiquer la période des données
"""


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
        # Widgets Generation
        {
            "key": "widgets_generation",
            "name": "Widgets Generation",
            "category": "widgets",
            "content": WIDGETS_GENERATION_NORMAL,
            "version": "normal",
            "is_active": True,
            "tokens_estimate": 800,
            "description": "Génération des widgets et questions suggérées. Placeholder {schema}."
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
