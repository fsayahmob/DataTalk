// API functions for saved reports

import { SavedReport } from "@/types";
import { API_BASE, ExecuteReportResponse, SharedReportResponse } from "./types";

export async function fetchSavedReports(): Promise<SavedReport[]> {
  try {
    const res = await fetch(`${API_BASE}/reports`);
    const data = await res.json();
    return data.reports || [];
  } catch (e) {
    console.error("Erreur chargement rapports:", e);
    return [];
  }
}

export async function saveReport(
  title: string,
  question: string,
  sql_query: string,
  chart_config: string,
  message_id: number
): Promise<boolean> {
  try {
    await fetch(`${API_BASE}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, question, sql_query, chart_config, message_id }),
    });
    return true;
  } catch (e) {
    console.error("Erreur sauvegarde:", e);
    return false;
  }
}

export async function deleteReport(id: number): Promise<boolean> {
  try {
    await fetch(`${API_BASE}/reports/${id}`, { method: "DELETE" });
    return true;
  } catch (e) {
    console.error("Erreur suppression:", e);
    return false;
  }
}

export async function executeReport(
  reportId: number
): Promise<ExecuteReportResponse> {
  const res = await fetch(`${API_BASE}/reports/${reportId}/execute`, {
    method: "POST",
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Erreur exécution rapport");
  }

  return data;
}

export async function fetchSharedReport(
  shareToken: string
): Promise<SharedReportResponse> {
  const res = await fetch(`${API_BASE}/reports/shared/${shareToken}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Rapport non trouvé");
  }

  return data;
}
