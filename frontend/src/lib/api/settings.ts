// API functions for application settings

import { API_BASE, CatalogContextMode, DatabaseStatus } from "./types";

// ============ Catalog Context Mode ============

export async function fetchCatalogContextMode(): Promise<CatalogContextMode> {
  try {
    const res = await fetch(`${API_BASE}/settings/catalog_context_mode`);
    if (!res.ok) return "full"; // défaut
    const data = await res.json();
    return data.value as CatalogContextMode;
  } catch {
    return "full";
  }
}

export async function setCatalogContextMode(
  mode: CatalogContextMode
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/settings/catalog_context_mode`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: mode }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ============ Database Status ============

export async function fetchDatabaseStatus(): Promise<DatabaseStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/database/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("Erreur chargement statut DB:", e);
    return null;
  }
}

export async function setDuckdbPath(path: string): Promise<{ success: boolean; error?: string; resolved_path?: string }> {
  try {
    const res = await fetch(`${API_BASE}/settings/duckdb_path`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: path }),
    });
    if (!res.ok) {
      const data = await res.json();
      return { success: false, error: data.detail || "Erreur" };
    }
    const data = await res.json();
    return { success: true, resolved_path: data.resolved_path };
  } catch (e) {
    console.error("Erreur mise à jour chemin DuckDB:", e);
    return { success: false, error: String(e) };
  }
}

// ============ Catalog Settings ============

export async function fetchMaxTablesPerBatch(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/settings/max_tables_per_batch`);
    if (!res.ok) return 15;
    const data = await res.json();
    return parseInt(data.value, 10) || 15;
  } catch {
    return 15;
  }
}

export async function setMaxTablesPerBatch(value: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/settings/max_tables_per_batch`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: String(value) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchMaxChartRows(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/settings/max_chart_rows`);
    if (!res.ok) return 5000; // Default value
    const data = await res.json();
    return parseInt(data.value, 10) || 5000;
  } catch {
    return 5000;
  }
}

export async function setMaxChartRows(value: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/settings/max_chart_rows`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: String(value) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
