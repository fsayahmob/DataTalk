// API functions for conversations and analysis

import { Message, Conversation } from "@/types";
import { API_BASE, AnalysisResponse, AnalysisFilters } from "./types";

export async function fetchConversations(): Promise<Conversation[]> {
  try {
    const res = await fetch(`${API_BASE}/conversations`);
    const data = await res.json();
    return data.conversations || [];
  } catch (e) {
    console.error("Erreur chargement conversations:", e);
    return [];
  }
}

export async function createConversation(): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE}/conversations`, { method: "POST" });
    const data = await res.json();
    return data.id;
  } catch (e) {
    console.error("Erreur création conversation:", e);
    return null;
  }
}

export async function fetchConversationMessages(
  conversationId: number
): Promise<Message[]> {
  try {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`);
    const data = await res.json();
    return data.messages || [];
  } catch (e) {
    console.error("Erreur chargement messages:", e);
    return [];
  }
}

export async function deleteAllConversations(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/conversations`, { method: "DELETE" });
    const data = await res.json();
    return data.count || 0;
  } catch (e) {
    console.error("Erreur suppression conversations:", e);
    return 0;
  }
}

export async function analyzeInConversation(
  conversationId: number,
  question: string,
  filters?: AnalysisFilters,
  useContext = false,
  signal?: AbortSignal
): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, filters, use_context: useContext }),
    signal,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Erreur serveur");
  }

  return data;
}
