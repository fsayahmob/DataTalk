// API functions for data catalog management

import {
  API_BASE,
  CatalogResponse,
  CatalogGenerateResponse,
  CatalogExtractResponse,
  CatalogEnrichResponse,
  ToggleTableResponse,
  CatalogJob,
  Run,
  RunResponse,
} from "./types";

// ============ Catalog CRUD ============

export async function fetchCatalog(): Promise<CatalogResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog`);
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur chargement catalogue:", e);
    return null;
  }
}

export async function generateCatalog(): Promise<CatalogGenerateResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog/generate`, { method: "POST" });
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur génération catalogue:", e);
    return null;
  }
}

export async function extractCatalog(): Promise<CatalogExtractResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog/extract`, { method: "POST" });
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur extraction catalogue:", e);
    return null;
  }
}

export async function enrichCatalog(tableIds: number[]): Promise<CatalogEnrichResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table_ids: tableIds }),
    });
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Erreur enrichissement catalogue:", e);
    return null;
  }
}

export async function deleteCatalog(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/catalog`, { method: "DELETE" });
    return res.ok;
  } catch (e) {
    console.error("Erreur suppression catalogue:", e);
    return false;
  }
}

// ============ Table Management ============

export async function toggleTableEnabled(
  tableId: number
): Promise<ToggleTableResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog/tables/${tableId}/toggle`, {
      method: "PATCH",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("Erreur toggle table:", e);
    return null;
  }
}

export async function updateColumnDescription(columnId: number, description: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/catalog/columns/${columnId}/description`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    return res.ok;
  } catch (e) {
    console.error("Erreur update description:", e);
    return false;
  }
}

// ============ Catalog Jobs & Runs ============

export async function fetchLatestRun(): Promise<RunResponse> {
  try {
    const res = await fetch(`${API_BASE}/catalog/latest-run`);
    if (!res.ok) {
      if (res.status === 404) {
        console.log("Aucune run trouvée (404)");
      } else {
        console.error(`Erreur serveur (${res.status})`);
      }
      return { run: [] };
    }
    return await res.json();
  } catch (e) {
    console.error("Erreur chargement run:", e);
    return { run: [] };
  }
}

export async function fetchRun(runId: string): Promise<RunResponse> {
  try {
    const res = await fetch(`${API_BASE}/catalog/run/${runId}`);
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`Run ${runId} non trouvée (404)`);
      } else {
        console.error(`Erreur serveur (${res.status})`);
      }
      return { run: [] };
    }
    return await res.json();
  } catch (e) {
    console.error("Erreur chargement run:", e);
    return { run: [] };
  }
}

export async function fetchCatalogJobs(limit = 50): Promise<CatalogJob[]> {
  try {
    const res = await fetch(`${API_BASE}/catalog/jobs?limit=${limit}`);
    const data = await res.json();
    return data.jobs || [];
  } catch (e) {
    console.error("Erreur chargement jobs:", e);
    return [];
  }
}

export async function fetchRuns(): Promise<Run[]> {
  try {
    const res = await fetch(`${API_BASE}/catalog/runs`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.runs || [];
  } catch (e) {
    console.error("Erreur chargement runs:", e);
    return [];
  }
}
