// API functions for LLM providers, models, and prompts

import { API_BASE, apiFetch, LLMStatus, LLMProvider, LLMModel, LLMCosts, LLMPrompt } from "./types";

// ============ LLM Status & Config ============

export async function fetchLLMStatus(): Promise<LLMStatus> {
  try {
    const res = await apiFetch(`${API_BASE}/llm/status`);
    return await res.json();
  } catch {
    return { status: "error", message: "Connexion impossible" };
  }
}

export async function saveApiKey(
  providerName: string,
  apiKey: string
): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider_name: providerName, api_key: apiKey }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function saveProviderConfig(
  providerName: string,
  baseUrl: string | null
): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}/llm/providers/${providerName}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_url: baseUrl }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ============ LLM Providers & Models ============

export async function fetchLLMProviders(): Promise<LLMProvider[]> {
  try {
    const res = await apiFetch(`${API_BASE}/llm/providers`);
    const data = await res.json();
    return data.providers || [];
  } catch (e) {
    console.error("Erreur chargement providers:", e);
    return [];
  }
}

export async function fetchLLMModels(
  providerName?: string
): Promise<LLMModel[]> {
  try {
    const url = providerName
      ? `${API_BASE}/llm/models?provider_name=${providerName}`
      : `${API_BASE}/llm/models`;
    const res = await apiFetch(url);
    const data = await res.json();
    return data.models || [];
  } catch (e) {
    console.error("Erreur chargement modèles:", e);
    return [];
  }
}

export async function fetchDefaultModel(): Promise<LLMModel | null> {
  try {
    const res = await apiFetch(`${API_BASE}/llm/models/default`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.model;
  } catch {
    return null;
  }
}

export async function setDefaultModel(modelId: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}/llm/models/default/${modelId}`, {
      method: "PUT",
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ============ LLM Costs ============

export async function fetchLLMCosts(days = 30): Promise<LLMCosts | null> {
  try {
    const res = await apiFetch(`${API_BASE}/llm/costs?days=${days}`);
    return await res.json();
  } catch {
    return null;
  }
}

// ============ LLM Prompts ============

export async function fetchLLMPrompts(category?: string): Promise<LLMPrompt[]> {
  try {
    const url = category
      ? `${API_BASE}/llm/prompts?category=${category}`
      : `${API_BASE}/llm/prompts`;
    const res = await apiFetch(url);
    const data = await res.json();
    return data.prompts || [];
  } catch (e) {
    console.error("Erreur chargement prompts:", e);
    return [];
  }
}

export async function setActivePromptVersion(
  key: string,
  version: string
): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}/llm/prompts/${key}/active`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ============ Legacy Prompts API (/prompts endpoint) ============

export async function fetchPrompts(): Promise<LLMPrompt[]> {
  try {
    const res = await apiFetch(`${API_BASE}/prompts`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.prompts || [];
  } catch (e) {
    console.error("Erreur chargement prompts:", e);
    return [];
  }
}

export async function fetchPrompt(key: string): Promise<LLMPrompt | null> {
  try {
    const res = await apiFetch(`${API_BASE}/prompts/${key}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error(`Erreur chargement prompt ${key}:`, e);
    return null;
  }
}

export async function updatePrompt(key: string, content: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}/prompts/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    return res.ok;
  } catch (e) {
    console.error(`Erreur mise à jour prompt ${key}:`, e);
    return false;
  }
}
