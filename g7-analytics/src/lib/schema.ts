// Schéma de la base de données pour le contexte Gemini
export const DB_SCHEMA = `
Table: evaluations (64 385 évaluations de courses de taxi G7 - Mai 2024)

Colonnes:
- cod_taxi (INTEGER): Identifiant unique du chauffeur
- annee (INTEGER): Année de la course (2024)
- mois (INTEGER): Mois de la course (5 = mai)
- dat_course (DATE): Date de la course
- heure_course (TIME): Heure de la course
- num_course (BIGINT): Numéro unique de la course
- note_eval (DECIMAL): Note globale donnée par le client (1 à 5, 5 = excellent)
- valide (VARCHAR): Statut de validation
- commentaire (VARCHAR): Commentaire libre du client (7 256 non vides)
- note_commande (DECIMAL): Note sur la réservation (1 à 5)
- note_vehicule (DECIMAL): Note sur le véhicule (1 à 5)
- note_chauffeur (DECIMAL): Note sur le chauffeur (1 à 5)
- typ_client (VARCHAR): Type de client (36 valeurs: Corporate, Premium, Standard, etc.)
- typ_chauffeur (VARCHAR): Type de service (VIP, Standard, Green)
- lib_categorie (VARCHAR): Catégorie métier du client (8 valeurs)
- cod_client (INTEGER): Identifiant du client
- lib_racine (VARCHAR): Société racine du client
- eval_masque (VARCHAR): Indicateur d'évaluation masquée
`;

export const CHART_TYPES = [
  "bar",      // Barres verticales - comparaison de catégories
  "line",     // Lignes - évolution temporelle
  "pie",      // Camembert - répartition (max 10 valeurs)
  "area",     // Aires - évolution avec volume
  "scatter",  // Nuage de points - corrélation
  "none"      // Pas de graphique, juste les données
] as const;

export type ChartType = typeof CHART_TYPES[number];

export interface ChartConfig {
  type: ChartType;
  x: string;
  y: string;
  color?: string;
  title: string;
}

export interface GeminiResponse {
  sql: string;
  message: string;
  chart: ChartConfig;
}

export const SYSTEM_PROMPT = `Tu es un assistant analytique pour G7 Taxis. Tu analyses les données d'évaluations clients.

${DB_SCHEMA}

TYPES DE GRAPHIQUES DISPONIBLES:
- bar: Barres verticales pour comparer des catégories
- line: Lignes pour montrer une évolution temporelle
- pie: Camembert pour montrer une répartition (utiliser uniquement si <= 10 valeurs)
- area: Aires pour montrer une évolution avec volume
- scatter: Nuage de points pour montrer une corrélation
- none: Pas de graphique, juste afficher les données en tableau

RÈGLES:
1. Génère du SQL DuckDB valide
2. Utilise des alias clairs en français pour les colonnes (ex: AS note_moyenne)
3. Limite les résultats à 20 lignes max sauf demande explicite
4. Pour les graphiques pie, limite à 10 catégories max
5. Choisis le type de graphique le plus adapté à la question
6. Réponds toujours en français

Réponds UNIQUEMENT en JSON valide avec cette structure exacte:
{
  "sql": "SELECT ...",
  "message": "Explication en français des résultats...",
  "chart": {
    "type": "bar|line|pie|area|scatter|none",
    "x": "nom_colonne_axe_x",
    "y": "nom_colonne_axe_y",
    "title": "Titre du graphique"
  }
}`;
