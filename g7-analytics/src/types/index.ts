// Types partagés pour G7 Analytics
import { ChartConfig } from "@/lib/schema";

export interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  chart?: ChartConfig;
  data?: Record<string, unknown>[];
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
  created_at: string;
}

export interface Conversation {
  id: number;
  title: string;
  message_count: number;
  created_at: string;
}

export interface CategoryStat {
  category: string;
  count: number;
  sentiment: number;
}

export interface SemanticStats {
  global: {
    total_evaluations: number;
    total_commentaires: number;
    commentaires_enrichis: number;
    sentiment_moyen: number;
    taux_enrichissement: number;
  };
  sentiment_distribution: Array<{ label: string; count: number }>;
  alerts: CategoryStat[];
  strengths: CategoryStat[];
  categories_by_sentiment: CategoryStat[];
}

export interface GlobalStats {
  total_evaluations: number;
  note_moyenne: number;
  total_commentaires: number;
  total_chauffeurs: number;
}
