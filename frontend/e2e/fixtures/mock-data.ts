// Mock data for E2E tests

export const mockPredefinedQuestions = [
  { id: 1, question: "Quelle est la note moyenne globale ?", category: "Satisfaction", icon: "⭐", display_order: 1 },
  { id: 2, question: "Répartition des notes de 1 à 5", category: "Satisfaction", icon: "⭐", display_order: 2 },
  { id: 3, question: "Top 10 chauffeurs les mieux notés", category: "Performance", icon: "🏆", display_order: 3 },
  { id: 4, question: "Évolution des notes par jour", category: "Tendances", icon: "📈", display_order: 4 },
];

export const mockConversations = [
  { id: 1, title: "Analyse notes mai 2024", created_at: "2024-05-15T10:00:00Z", updated_at: "2024-05-15T10:30:00Z" },
  { id: 2, title: "Top chauffeurs", created_at: "2024-05-14T14:00:00Z", updated_at: "2024-05-14T14:20:00Z" },
];

export const mockMessages = [
  { id: 1, role: "user", content: "Quelle est la note moyenne ?", conversation_id: 1 },
  {
    id: 2,
    role: "assistant",
    content: "La note moyenne globale est de 4.32 sur 5.",
    sql: "SELECT AVG(note_eval) as note_moyenne FROM evaluations",
    chart: { type: "bar", x: "category", y: "value", title: "Note moyenne" },
    data: [{ category: "Note moyenne", value: 4.32 }],
    model_name: "gemini-2.0-flash",
    tokens_input: 150,
    tokens_output: 80,
    response_time_ms: 1250,
    conversation_id: 1
  },
];

export const mockGlobalStats = {
  total_evaluations: 64383,
  note_moyenne: 4.32,
  total_commentaires: 7255,
  total_chauffeurs: 1842,
};

export const mockSemanticStats = {
  global: {
    sentiment_moyen: 0.42,
    commentaires_enrichis: 7100,
    total_commentaires: 7255,
    taux_enrichissement: 98,
  },
  sentiment_distribution: [
    { label: "Très positif", count: 2500 },
    { label: "Positif", count: 2800 },
    { label: "Neutre", count: 1200 },
    { label: "Négatif", count: 450 },
    { label: "Très négatif", count: 150 },
  ],
  alerts: [
    { category: "PRIX_FACTURATION", count: 320, sentiment: -0.65 },
    { category: "VEHICULE_PROPRETE", count: 180, sentiment: -0.45 },
  ],
  strengths: [
    { category: "CHAUFFEUR_COMPORTEMENT", count: 1500, sentiment: 0.72 },
    { category: "PONCTUALITE", count: 890, sentiment: 0.58 },
  ],
};

export const mockSavedReports = [
  { id: 1, title: "Note moyenne mensuelle", question: "Note moyenne par mois", sql: "SELECT...", is_pinned: true, created_at: "2024-05-10T10:00:00Z" },
  { id: 2, title: "Top 10 chauffeurs", question: "Top chauffeurs", sql: "SELECT...", is_pinned: false, created_at: "2024-05-11T14:00:00Z" },
];

export const mockAnalyzeResponse = {
  message_id: 100,
  message: "La note moyenne globale est de 4.32 sur 5.",
  sql: "SELECT AVG(note_eval) as note_moyenne FROM evaluations",
  chart: {
    type: "bar" as const,
    x: "label",
    y: "value",
    title: "Note moyenne"
  },
  data: [{ label: "Note moyenne", value: 4.32 }],
  model_name: "gemini-2.0-flash",
  tokens_input: 150,
  tokens_output: 80,
  response_time_ms: 1250,
};
