// API functions for widgets, KPIs, and suggested questions

import { API_BASE, apiFetch, SuggestedQuestion, KpiCompactData, KpisResponse } from "./types";

// ============ Suggested Questions ============

export async function fetchSuggestedQuestions(): Promise<SuggestedQuestion[]> {
  try {
    const res = await apiFetch(`${API_BASE}/suggested-questions`);
    const data = await res.json();
    return data.questions || [];
  } catch (e) {
    console.error("Erreur chargement questions suggérées:", e);
    return [];
  }
}

// ============ KPIs ============

export async function fetchKpis(): Promise<KpiCompactData[]> {
  try {
    const res = await apiFetch(`${API_BASE}/kpis`);
    const data: KpisResponse = await res.json();
    return data.kpis || [];
  } catch (e) {
    console.error("Erreur chargement KPIs:", e);
    return [];
  }
}
