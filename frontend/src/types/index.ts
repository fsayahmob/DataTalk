// Types partagés pour l'application Analytics

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
  y: string | string[];  // Une ou plusieurs séries Y
  color?: string;
  title: string;
}

export interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  sql_error?: string;
  chart?: ChartConfig;
  data?: Record<string, unknown>[];
  // Protection chart pour gros volumes
  chart_disabled?: boolean;
  chart_disabled_reason?: string;
  // Métadonnées de performance
  model_name?: string;
  tokens_input?: number;
  tokens_output?: number;
  response_time_ms?: number;
  created_at?: string;
}

export interface PredefinedQuestion {
  id: number;
  question: string;
  category: string;
  icon: string;
}

export interface SavedReport {
  id: number;
  title: string;
  question: string;
  sql_query: string;
  chart_config?: string; // JSON de la config du graphique
  is_pinned: boolean;
  share_token: string; // UUID pour partage public
  created_at: string;
}

export interface Conversation {
  id: number;
  title: string;
  message_count: number;
  created_at: string;
}
