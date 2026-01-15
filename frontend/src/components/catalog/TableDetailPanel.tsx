"use client";

import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/icons";
import type { CatalogTable } from "@/lib/api";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";

interface TableDetailPanelProps {
  table: CatalogTable;
  onClose: () => void;
  onTableToggle?: (tableId: number, newState: boolean) => void;
}

export function TableDetailPanel({ table, onClose, onTableToggle }: TableDetailPanelProps) {
  const { t } = useTranslation();
  // L'état vient directement des props (géré par le parent)
  const isEnabled = table.is_enabled ?? true;

  // Récupérer le mode catalog_context_mode
  const [contextMode, setContextMode] = useState<"compact" | "full">("full");

  // État pour l'édition des descriptions
  const [editingColumnId, setEditingColumnId] = useState<number | null>(null);
  const [editingDescription, setEditingDescription] = useState("");

  useEffect(() => {
    void api.fetchCatalogContextMode().then(setContextMode);
  }, []);

  const handleStartEdit = (columnId: number, currentDescription: string) => {
    setEditingColumnId(columnId);
    setEditingDescription(currentDescription || "");
  };

  const handleSaveDescription = async (columnId: number) => {
    const trimmed = editingDescription.trim();
    if (!trimmed) {
      toast.error(t("catalog.description_empty"));
      return;
    }

    const success = await api.updateColumnDescription(columnId, trimmed);
    if (success) {
      toast.success(t("catalog.description_updated"));
      // Mettre à jour localement
      const column = table.columns.find(c => c.id === columnId);
      if (column) {
        column.description = trimmed;
      }
      setEditingColumnId(null);
    } else {
      toast.error(t("catalog.update_error"));
    }
  };

  const handleCancelEdit = () => {
    setEditingColumnId(null);
    setEditingDescription("");
  };

  // Une table est considérée "enrichie" si elle a une description
  const isEnriched = !!table.description;

  // Toggle local uniquement (pas d'appel API)
  const handleToggle = () => {
    if (!table.id) return;
    // Notifier le parent du changement (état local uniquement)
    onTableToggle?.(table.id, !isEnabled);
  };

  return (
    <div className="w-[400px] border-l border-border/30 bg-sidebar flex flex-col overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 border-b border-border/30 flex items-center justify-between ${
        !isEnabled
          ? "bg-muted-foreground/10"
          : !isEnriched
            ? "bg-amber-500/10"
            : "bg-primary/10"
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <h3 className={`font-mono font-bold ${isEnabled ? "text-foreground" : "text-muted-foreground"}`}>{table.name}</h3>
            {!isEnabled && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted-foreground/20 text-muted-foreground uppercase">
                {t("catalog.excluded")}
              </span>
            )}
            {isEnabled && !isEnriched && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 uppercase">
                {t("catalog.not_enriched")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {table.row_count?.toLocaleString() || 0} {t("common.rows")}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
          <CloseIcon size={16} />
        </Button>
      </div>

      {/* Toggle enable/disable */}
      <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between bg-secondary/20">
        <div>
          <p className="text-sm font-medium">{t("catalog.include_enrichment")}</p>
          <p className="text-xs text-muted-foreground">
            {isEnabled ? t("catalog.will_be_enriched") : t("catalog.excluded_from_enrichment")}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={!table.id}
          className={`
            relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out cursor-pointer
            ${isEnabled ? "bg-primary" : "bg-muted-foreground/30"}
          `}
        >
          <span
            className={`
              absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md
              transition-transform duration-200 ease-in-out
              ${isEnabled ? "translate-x-5" : "translate-x-0"}
            `}
          />
        </button>
      </div>

      {/* Avertissement si non enrichie */}
      {isEnabled && !isEnriched && (
        <div className="px-4 py-3 border-b border-border/20 bg-amber-500/10">
          <p className="text-xs text-amber-400">
            {t("catalog.not_enriched_warning")}
          </p>
        </div>
      )}

      {/* Description de la table */}
      {table.description && (
        <div className="px-4 py-3 border-b border-border/20 bg-primary/5">
          <p className="text-sm text-muted-foreground">{table.description}</p>
        </div>
      )}

      {/* Tableau des colonnes */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background border-b border-border/30">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("catalog.column")}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("catalog.type")}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("catalog.description")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {table.columns.map((col, idx) => (
              <tr
                key={col.name}
                className={`hover:bg-primary/5 ${idx % 2 === 0 ? "bg-background/5" : ""}`}
              >
                <td className="px-3 py-2">
                  <span className="font-mono text-foreground">{col.name}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-muted-foreground uppercase text-[10px]">
                    {col.data_type.split("(")[0]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {editingColumnId === col.id ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={editingDescription}
                        onChange={(e) => setEditingDescription(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSaveDescription(col.id!);
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        className="flex-1 px-2 py-1 text-xs bg-background border border-primary rounded focus:outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                      />
                      <button
                        onClick={() => void handleSaveDescription(col.id!)}
                        className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                      >
                        ✓
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded hover:bg-muted/80"
                      >
                        ✗
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => col.id && handleStartEdit(col.id, col.description || "")}
                      className={`cursor-pointer hover:bg-primary/10 rounded px-1 -mx-1 py-0.5 ${
                        col.description ? "text-foreground/80" : "text-muted-foreground/50 italic"
                      }`}
                      title={t("catalog.click_to_edit")}
                    >
                      {col.description || t("catalog.add_description")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Contexte des valeurs (full_context avec statistiques) */}
      <div className="border-t border-border/30 p-3 bg-sidebar">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("catalog.value_analysis")}
          </h4>
          <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-mono ${
            contextMode === "full"
              ? "bg-primary/20 text-primary"
              : "bg-amber-500/20 text-amber-400"
          }`}>
            {t("prompts.mode_label", { mode: contextMode })}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground/70 mb-2">
          {contextMode === "full"
            ? t("catalog.full_stats_sent")
            : t("catalog.compact_stats_sent")}
        </div>
        <div className="space-y-1.5 max-h-64 overflow-auto">
          {table.columns
            .filter((col) => col.full_context || col.sample_values || col.value_range)
            .map((col) => {
              // En mode COMPACT, afficher value_range au lieu de full_context
              const displayValue = contextMode === "compact"
                ? (col.value_range || col.sample_values)
                : (col.full_context || col.sample_values);

              return (
                <div key={col.name} className="text-xs">
                  <span className="font-mono text-primary/80">{col.name}:</span>{" "}
                  <span className={`text-[11px] leading-relaxed ${
                    contextMode === "full"
                      ? "text-muted-foreground/90"
                      : "text-muted-foreground/60"
                  }`}>
                    {displayValue}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
