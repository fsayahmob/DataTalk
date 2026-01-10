"""
Script pour peupler le catalogue avec les métadonnées G7.
À exécuter une fois pour initialiser, ou quand le schéma change.
"""
from catalog import (
    add_column,
    add_datasource,
    add_synonym,
    add_table,
    get_schema_for_llm,
    init_catalog,
)


def seed_g7_catalog():
    """Peuple le catalogue avec les données G7."""

    # Initialiser le catalogue
    init_catalog()

    # Ajouter la source de données DuckDB
    ds_id = add_datasource(
        name="g7_analytics",
        type="duckdb",
        path="../data/g7_analytics.duckdb",
        description="Base analytique G7 Taxis - Évaluations clients Mai 2024"
    )

    # Ajouter la table evaluations
    table_id = add_table(
        datasource_id=ds_id,
        name="evaluations",
        description="Évaluations de courses de taxi G7 - Mai 2024",
        row_count=64385
    )

    # Ajouter les colonnes avec descriptions métier
    columns = [
        {
            "name": "cod_taxi",
            "data_type": "INTEGER",
            "description": "Identifiant unique du chauffeur de taxi",
            "is_primary_key": False,
            "synonyms": ["chauffeur", "driver", "taxi"]
        },
        {
            "name": "annee",
            "data_type": "INTEGER",
            "description": "Année de la course",
            "sample_values": "2024"
        },
        {
            "name": "mois",
            "data_type": "INTEGER",
            "description": "Mois de la course",
            "sample_values": "5",
            "value_range": "1-12"
        },
        {
            "name": "dat_course",
            "data_type": "DATE",
            "description": "Date de la course",
            "synonyms": ["date", "jour"]
        },
        {
            "name": "heure_course",
            "data_type": "TIME",
            "description": "Heure de départ de la course",
            "synonyms": ["heure", "horaire"]
        },
        {
            "name": "num_course",
            "data_type": "BIGINT",
            "description": "Numéro unique de la course",
            "is_primary_key": True
        },
        {
            "name": "note_eval",
            "data_type": "DECIMAL",
            "description": "Note globale donnée par le client",
            "value_range": "1-5 (5=excellent)",
            "synonyms": ["note", "évaluation", "score", "rating", "satisfaction"]
        },
        {
            "name": "valide",
            "data_type": "VARCHAR",
            "description": "Statut de validation de l'évaluation",
            "sample_values": "OUI, NON"
        },
        {
            "name": "commentaire",
            "data_type": "VARCHAR",
            "description": "Commentaire libre du client (7 256 non vides sur 64 385)",
            "synonyms": ["avis", "feedback", "remarque", "texte"]
        },
        {
            "name": "note_commande",
            "data_type": "DECIMAL",
            "description": "Note sur la réservation/commande",
            "value_range": "1-5",
            "synonyms": ["réservation", "booking"]
        },
        {
            "name": "note_vehicule",
            "data_type": "DECIMAL",
            "description": "Note sur l'état du véhicule",
            "value_range": "1-5",
            "synonyms": ["voiture", "auto", "propreté"]
        },
        {
            "name": "note_chauffeur",
            "data_type": "DECIMAL",
            "description": "Note sur le comportement du chauffeur",
            "value_range": "1-5",
            "synonyms": ["conducteur", "driver", "service"]
        },
        {
            "name": "typ_client",
            "data_type": "VARCHAR",
            "description": "Segment/type de client",
            "sample_values": "11-CLUB AFFAIRES SOCIÉTÉS, 59-GRAND PUBLIC, 15-CLUB AFFAIRES PREMIUM",
            "synonyms": ["segment", "catégorie client", "type"]
        },
        {
            "name": "typ_chauffeur",
            "data_type": "VARCHAR",
            "description": "Type de service du chauffeur",
            "sample_values": "VIP, Standard, Green",
            "synonyms": ["service", "gamme"]
        },
        {
            "name": "lib_categorie",
            "data_type": "VARCHAR",
            "description": "Offre commerciale du client (8 valeurs)",
            "sample_values": "Club affaires, Service plus, Service",
            "synonyms": ["offre", "formule"]
        },
        {
            "name": "cod_client",
            "data_type": "INTEGER",
            "description": "Identifiant unique du client",
            "synonyms": ["client", "customer"]
        },
        {
            "name": "lib_racine",
            "data_type": "VARCHAR",
            "description": "Nom de la société racine du client",
            "synonyms": ["entreprise", "société", "company"]
        },
        {
            "name": "eval_masque",
            "data_type": "VARCHAR",
            "description": "Indicateur si l'évaluation est masquée",
            "sample_values": "OUI, NON"
        },
        # === COLONNES ENRICHIES PAR IA ===
        {
            "name": "sentiment_global",
            "data_type": "FLOAT",
            "description": "Sentiment du commentaire (-1 à +1)",
            "value_range": "-1 à +1",
            "synonyms": ["sentiment", "polarité"]
        },
        {
            "name": "verbatim_cle",
            "data_type": "VARCHAR",
            "description": "Extrait clé du commentaire",
            "synonyms": ["extrait", "résumé"]
        }
    ]

    for col in columns:
        col_id = add_column(
            table_id=table_id,
            name=col["name"],
            data_type=col["data_type"],
            description=col.get("description"),
            sample_values=col.get("sample_values"),
            value_range=col.get("value_range"),
            is_primary_key=col.get("is_primary_key", False)
        )

        # Ajouter les synonymes
        for synonym in col.get("synonyms", []):
            add_synonym(col_id, synonym)

    # ========================================
    # VUE DÉNORMALISÉE: evaluation_categories
    # ========================================
    # Cette vue "aplatit" les catégories pour faciliter les requêtes
    view_id = add_table(
        datasource_id=ds_id,
        name="evaluation_categories",
        description="Vue dénormalisée: 1 ligne par catégorie par commentaire (pour analyses par thème)",
        row_count=7763
    )

    view_columns = [
        {"name": "num_course", "data_type": "BIGINT", "description": "ID de la course"},
        {"name": "dat_course", "data_type": "DATE", "description": "Date de la course"},
        {"name": "cod_taxi", "data_type": "INTEGER", "description": "ID chauffeur"},
        {"name": "cod_client", "data_type": "INTEGER", "description": "ID client"},
        {"name": "typ_client", "data_type": "VARCHAR", "description": "Segment client"},
        {"name": "typ_chauffeur", "data_type": "VARCHAR", "description": "Type chauffeur (VIP/Standard/Green)"},
        {"name": "offre_commerciale", "data_type": "VARCHAR", "description": "Offre du client"},
        {"name": "note_eval", "data_type": "DECIMAL", "description": "Note globale (1-5)"},
        {"name": "commentaire", "data_type": "VARCHAR", "description": "Texte du commentaire"},
        {"name": "sentiment_global", "data_type": "FLOAT", "description": "Sentiment global (-1 à +1)"},
        {
            "name": "categorie",
            "data_type": "VARCHAR",
            "description": "Thème sémantique du commentaire",
            "sample_values": "CHAUFFEUR_COMPORTEMENT, PRIX_FACTURATION, PONCTUALITE, TRAJET_ITINERAIRE",
            "synonyms": ["thème", "sujet", "topic", "catégorie sémantique"]
        },
        {
            "name": "sentiment_categorie",
            "data_type": "FLOAT",
            "description": "Sentiment spécifique à ce thème (-1 à +1)",
            "value_range": "-1 à +1",
            "synonyms": ["sentiment par thème", "sentiment thématique"]
        },
        {"name": "verbatim_cle", "data_type": "VARCHAR", "description": "Extrait clé"}
    ]

    for col in view_columns:
        col_id = add_column(
            table_id=view_id,
            name=col["name"],
            data_type=col["data_type"],
            description=col.get("description"),
            sample_values=col.get("sample_values"),
            value_range=col.get("value_range"),
            is_primary_key=False
        )
        for synonym in col.get("synonyms", []):
            add_synonym(col_id, synonym)

    print("Catalogue G7 peuplé avec succès!")
    print("\n" + "="*60)
    print("SCHÉMA GÉNÉRÉ POUR LE LLM:")
    print("="*60)
    print(get_schema_for_llm())


if __name__ == "__main__":
    seed_g7_catalog()
