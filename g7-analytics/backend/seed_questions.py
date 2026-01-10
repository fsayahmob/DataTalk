"""
Script pour peupler les questions prédéfinies dans le catalogue.
À exécuter une fois pour initialiser.
"""
from catalog import add_predefined_question, get_predefined_questions, init_catalog

PREDEFINED_QUESTIONS = [
    # Satisfaction
    {
        "question": "Quelle est la note moyenne globale ?",
        "category": "Satisfaction",
        "icon": "star",
        "display_order": 1
    },
    {
        "question": "Répartition des notes de 1 à 5",
        "category": "Satisfaction",
        "icon": "star",
        "display_order": 2
    },
    {
        "question": "Quels types de clients sont les plus satisfaits ?",
        "category": "Satisfaction",
        "icon": "star",
        "display_order": 3
    },

    # Performance
    {
        "question": "Top 10 chauffeurs les mieux notés",
        "category": "Performance",
        "icon": "trophy",
        "display_order": 1
    },
    {
        "question": "Chauffeurs avec plus de 50 évaluations",
        "category": "Performance",
        "icon": "trophy",
        "display_order": 2
    },
    {
        "question": "Note moyenne par type de chauffeur (VIP, Standard, Green)",
        "category": "Performance",
        "icon": "trophy",
        "display_order": 3
    },

    # Tendances
    {
        "question": "Évolution des notes par jour",
        "category": "Tendances",
        "icon": "trending-up",
        "display_order": 1
    },
    {
        "question": "Heures de la journée avec les meilleures notes",
        "category": "Tendances",
        "icon": "trending-up",
        "display_order": 2
    },
    {
        "question": "Comparaison notes semaine vs weekend",
        "category": "Tendances",
        "icon": "trending-up",
        "display_order": 3
    },

    # Exploration
    {
        "question": "Combien de clients ont laissé un commentaire ?",
        "category": "Exploration",
        "icon": "search",
        "display_order": 1
    },
    {
        "question": "Répartition par catégorie client",
        "category": "Exploration",
        "icon": "search",
        "display_order": 2
    },
    {
        "question": "Note véhicule vs note chauffeur (corrélation)",
        "category": "Exploration",
        "icon": "search",
        "display_order": 3
    },
]


def seed_predefined_questions():
    """Peuple les questions prédéfinies."""
    # Initialiser le catalogue (crée les tables si nécessaire)
    init_catalog()

    # Vérifier si des questions existent déjà
    existing = get_predefined_questions()
    if existing:
        print(f"{len(existing)} questions existent déjà. Abandon.")
        print("Pour réinitialiser, supprimez le fichier catalog.sqlite et relancez.")
        return

    # Ajouter les questions
    for q in PREDEFINED_QUESTIONS:
        add_predefined_question(
            question=q["question"],
            category=q["category"],
            icon=q["icon"],
            display_order=q["display_order"]
        )
        print(f"  + [{q['category']}] {q['question']}")

    print(f"\n{len(PREDEFINED_QUESTIONS)} questions prédéfinies ajoutées!")


if __name__ == "__main__":
    seed_predefined_questions()
